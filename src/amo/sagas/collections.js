/* @flow */
import invariant from 'invariant';
import { push as pushLocation } from 'connected-react-router';
import { all, call, put, select, takeLatest } from 'redux-saga/effects';

import {
  ADD_ADDON_TO_COLLECTION,
  CREATE_COLLECTION,
  DELETE_COLLECTION,
  DELETE_COLLECTION_ADDON_NOTES,
  FETCH_CURRENT_COLLECTION,
  FETCH_CURRENT_COLLECTION_PAGE,
  FETCH_USER_COLLECTIONS,
  REMOVE_ADDON_FROM_COLLECTION,
  UPDATE_COLLECTION,
  UPDATE_COLLECTION_ADDON,
  abortAddAddonToCollection,
  abortFetchCurrentCollection,
  abortFetchUserCollections,
  addonAddedToCollection,
  addonRemovedFromCollection,
  beginCollectionModification,
  convertFiltersToQueryParams,
  finishCollectionModification,
  finishEditingCollectionDetails,
  fetchCurrentCollectionPage as fetchCurrentCollectionPageAction,
  loadCurrentCollection,
  loadCurrentCollectionPage,
  loadUserCollections,
  localizeCollectionDetail,
  unloadCollectionBySlug,
} from 'amo/reducers/collections';
import * as api from 'amo/api/collections';
import log from 'core/logger';
import { createErrorHandler, getState } from 'core/sagas/utils';
import type {
  CreateCollectionAddonParams,
  CreateCollectionParams,
  DeleteCollectionParams,
  GetAllUserCollectionsParams,
  GetCollectionAddonsParams,
  GetCollectionParams,
  RemoveAddonFromCollectionParams,
  UpdateCollectionParams,
  UpdateCollectionAddonParams,
} from 'amo/api/collections';
import type {
  AddAddonToCollectionAction,
  CreateCollectionAction,
  DeleteCollectionAction,
  FetchCurrentCollectionAction,
  FetchCurrentCollectionPageAction,
  FetchUserCollectionsAction,
  RemoveAddonFromCollectionAction,
  UpdateCollectionAction,
  UpdateCollectionAddonAction,
} from 'amo/reducers/collections';
import type { Saga } from 'core/types/sagas';

export function* fetchCurrentCollection({
  payload: { errorHandlerId, filters, slug, username },
}: FetchCurrentCollectionAction): Saga {
  const errorHandler = createErrorHandler(errorHandlerId);

  yield put(errorHandler.createClearingAction());

  try {
    const state = yield select(getState);

    const baseParams = {
      api: state.api,
      slug,
      username,
    };

    const detailParams: $Shape<GetCollectionParams> = {
      ...baseParams,
    };
    const addonsParams: $Shape<GetCollectionAddonsParams> = {
      ...baseParams,
      filters,
    };

    const { detail, addons } = yield all({
      detail: call(api.getCollectionDetail, detailParams),
      addons: call(api.getCollectionAddons, addonsParams),
    });

    const addonsToLoad = addons.results;

    yield put(
      loadCurrentCollection({
        addons: addonsToLoad,
        detail,
        pageSize: addons.page_size,
      }),
    );
  } catch (error) {
    log.warn(`Collection failed to load: ${error}`);
    yield put(errorHandler.createErrorAction(error));
    yield put(abortFetchCurrentCollection());
  }
}

export function* fetchCurrentCollectionPage({
  payload: { errorHandlerId, filters, slug, username },
}: FetchCurrentCollectionPageAction): Saga {
  const errorHandler = createErrorHandler(errorHandlerId);

  yield put(errorHandler.createClearingAction());

  try {
    const state = yield select(getState);

    const params: GetCollectionAddonsParams = {
      api: state.api,
      filters,
      slug,
      username,
    };
    const addons = yield call(api.getCollectionAddons, params);

    yield put(
      loadCurrentCollectionPage({
        addons: addons.results,
        numberOfAddons: addons.count,
        pageSize: addons.page_size,
      }),
    );
  } catch (error) {
    log.warn(`Collection page failed to load: ${error}`);
    yield put(errorHandler.createErrorAction(error));
    yield put(abortFetchCurrentCollection());
  }
}

export function* fetchUserCollections({
  payload: { errorHandlerId, username },
}: FetchUserCollectionsAction): Saga {
  const errorHandler = createErrorHandler(errorHandlerId);
  yield put(errorHandler.createClearingAction());

  try {
    const state = yield select(getState);

    const params: GetAllUserCollectionsParams = {
      api: state.api,
      username,
    };
    const collections = yield call(api.getAllUserCollections, params);

    yield put(loadUserCollections({ username, collections }));
  } catch (error) {
    log.warn(`Failed to fetch user collections: ${error}`);
    yield put(errorHandler.createErrorAction(error));
    yield put(abortFetchUserCollections({ username }));
  }
}

export function* addAddonToCollection({
  payload: {
    addonId,
    collectionId,
    editing,
    errorHandlerId,
    filters,
    notes,
    slug,
    username,
  },
}: AddAddonToCollectionAction): Saga {
  const errorHandler = createErrorHandler(errorHandlerId);
  yield put(errorHandler.createClearingAction());

  try {
    const state = yield select(getState);

    const params: CreateCollectionAddonParams = {
      addonId,
      api: state.api,
      slug,
      notes,
      username,
    };
    yield call(api.createCollectionAddon, params);

    if (editing) {
      invariant(filters, 'A filters parameter is required when editing');

      yield put(
        fetchCurrentCollectionPageAction({
          errorHandlerId: errorHandler.id,
          filters,
          slug,
          username,
        }),
      );
    }
    yield put(
      addonAddedToCollection({
        addonId,
        username,
        collectionId,
      }),
    );
  } catch (error) {
    log.warn(`Failed to add add-on to collection: ${error}`);
    yield put(errorHandler.createErrorAction(error));
    yield put(abortAddAddonToCollection({ addonId, username }));
  }
}

export function* modifyCollection(
  action: CreateCollectionAction | UpdateCollectionAction,
): Saga {
  const { type, payload } = action;
  const creating = type === CREATE_COLLECTION;

  const {
    defaultLocale,
    description,
    errorHandlerId,
    name,
    slug,
    username,
  } = payload;

  yield put(beginCollectionModification());

  const errorHandler = createErrorHandler(errorHandlerId);
  yield put(errorHandler.createClearingAction());

  let collectionSlug;
  let filters;
  let includeAddonId;
  if (action.type === UPDATE_COLLECTION) {
    collectionSlug = action.payload.collectionSlug;
    filters = action.payload.filters;
  }
  if (action.type === CREATE_COLLECTION) {
    includeAddonId = action.payload.includeAddonId;
  }

  try {
    const state = yield select(getState);
    let response;

    const baseApiParams = {
      api: state.api,
      defaultLocale,
      description,
      username,
    };

    if (creating) {
      invariant(name, 'name cannot be empty when creating');
      invariant(slug, 'slug cannot be empty when creating');
      const apiParams: $Shape<CreateCollectionParams> = {
        name,
        slug,
        ...baseApiParams,
      };
      response = yield call(api.createCollection, apiParams);

      if (includeAddonId) {
        const params: CreateCollectionAddonParams = {
          addonId: includeAddonId,
          api: state.api,
          slug,
          username,
        };
        yield call(api.createCollectionAddon, params);
      }
    } else {
      invariant(collectionSlug, 'collectionSlug cannot be empty when updating');
      const apiParams: $Shape<UpdateCollectionParams> = {
        collectionSlug,
        name,
        slug,
        ...baseApiParams,
      };
      response = yield call(api.updateCollection, apiParams);
    }

    const { lang, clientApp } = state.api;
    const effectiveSlug = (response && response.slug) || slug || collectionSlug;
    invariant(effectiveSlug, 'Both slug and collectionSlug cannot be empty');
    const newLocation = `/${lang}/${clientApp}/collections/${username}/${effectiveSlug}/edit/`;

    if (creating) {
      invariant(response, 'response is required when creating');
      // If a new collection was just created, load it so that it will
      // be available when the user arrives at the collection edit screen.
      if (!includeAddonId) {
        const localizedDetail = localizeCollectionDetail({
          detail: response,
          lang,
        });

        yield put(
          loadCurrentCollection({
            addons: [],
            detail: localizedDetail,
            pageSize: null,
          }),
        );
      }

      yield put(pushLocation(newLocation));
    } else {
      // TODO: invalidate the stored collection instead of redirecting.
      // Ultimately, we just want to invalidate the old collection data.
      // This redirect is in place to handle slug changes but it causes
      // a race condition if we mix it with deleting old collection data.
      // If we could move to an ID based URL then we won't have to redirect.
      // See https://github.com/mozilla/addons-server/issues/7529
      invariant(filters, 'filters are required when updating');
      yield put(
        pushLocation({
          pathname: newLocation,
          query: convertFiltersToQueryParams(filters),
        }),
      );

      const slugWasEdited = effectiveSlug !== collectionSlug;
      if (!slugWasEdited) {
        // Invalidate the stored collection object. This will force each
        // component to re-fetch the collection. This is only necessary
        // when the slug hasn't changed.
        yield put(unloadCollectionBySlug(effectiveSlug));
      }
      yield put(finishEditingCollectionDetails());
    }
  } catch (error) {
    log.warn(`Failed to ${type}: ${error}`);
    yield put(errorHandler.createErrorAction(error));
  } finally {
    yield put(finishCollectionModification());
  }
}

export function* removeAddonFromCollection({
  payload: { addonId, errorHandlerId, filters, slug, username },
}: RemoveAddonFromCollectionAction): Saga {
  const errorHandler = createErrorHandler(errorHandlerId);
  yield put(errorHandler.createClearingAction());

  try {
    const state = yield select(getState);

    const params: RemoveAddonFromCollectionParams = {
      addonId,
      api: state.api,
      slug,
      username,
    };
    yield call(api.removeAddonFromCollection, params);

    yield put(addonRemovedFromCollection());

    yield put(
      fetchCurrentCollectionPageAction({
        errorHandlerId: errorHandler.id,
        filters,
        slug,
        username,
      }),
    );
  } catch (error) {
    log.warn(`Failed to remove add-on from collection: ${error}`);
    yield put(errorHandler.createErrorAction(error));
  }
}

export function* deleteCollection({
  payload: { errorHandlerId, slug, username },
}: DeleteCollectionAction): Saga {
  const errorHandler = createErrorHandler(errorHandlerId);
  yield put(errorHandler.createClearingAction());

  try {
    const state = yield select(getState);
    const { lang, clientApp } = state.api;

    const params: DeleteCollectionParams = {
      api: state.api,
      slug,
      username,
    };

    yield call(api.deleteCollection, params);

    yield put(pushLocation(`/${lang}/${clientApp}/collections/`));

    // Unload the collection from state.
    yield put(unloadCollectionBySlug(slug));
  } catch (error) {
    log.warn(`Failed to delete collection: ${error}`);
    yield put(errorHandler.createErrorAction(error));
  }
}

export function* updateCollectionAddon({
  payload: { addonId, errorHandlerId, filters, notes, slug, username },
}: UpdateCollectionAddonAction): Saga {
  const errorHandler = createErrorHandler(errorHandlerId);
  yield put(errorHandler.createClearingAction());

  try {
    const state = yield select(getState);

    const params: UpdateCollectionAddonParams = {
      addonId,
      api: state.api,
      notes,
      slug,
      username,
    };
    yield call(api.updateCollectionAddon, params);

    yield put(
      fetchCurrentCollectionPageAction({
        errorHandlerId: errorHandler.id,
        filters,
        slug,
        username,
      }),
    );
  } catch (error) {
    log.warn(`Failed to update add-on in collection: ${error}`);
    yield put(errorHandler.createErrorAction(error));
  }
}

export default function* collectionsSaga(): Saga {
  yield takeLatest(ADD_ADDON_TO_COLLECTION, addAddonToCollection);
  yield takeLatest([CREATE_COLLECTION, UPDATE_COLLECTION], modifyCollection);
  yield takeLatest(DELETE_COLLECTION, deleteCollection);
  yield takeLatest(FETCH_CURRENT_COLLECTION, fetchCurrentCollection);
  yield takeLatest(FETCH_CURRENT_COLLECTION_PAGE, fetchCurrentCollectionPage);
  yield takeLatest(FETCH_USER_COLLECTIONS, fetchUserCollections);
  yield takeLatest(REMOVE_ADDON_FROM_COLLECTION, removeAddonFromCollection);
  yield takeLatest(
    [DELETE_COLLECTION_ADDON_NOTES, UPDATE_COLLECTION_ADDON],
    updateCollectionAddon,
  );
}
