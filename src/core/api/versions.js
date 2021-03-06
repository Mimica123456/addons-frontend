/* @flow */
import invariant from 'invariant';

import { callApi } from 'core/api';
import type { ApiState } from 'core/reducers/api';
import type {
  ExternalAddonVersionType,
  VersionIdType,
} from 'core/reducers/versions';
import type { PaginatedApiResponse } from 'core/types/api';

export type GetVersionParams = {|
  api: ApiState,
  slug: string,
  versionId: VersionIdType,
|};

export const getVersion = ({
  api,
  slug,
  versionId,
}: GetVersionParams): Promise<ExternalAddonVersionType> => {
  invariant(slug, 'slug is required');
  invariant(versionId, 'versionId is required');

  return callApi({
    apiState: api,
    auth: true,
    endpoint: `addons/addon/${slug}/versions/${versionId}/`,
  });
};

export type GetVersionsParams = {|
  api: ApiState,
  page?: string,
  slug: string,
|};

export const getVersions = ({
  api,
  slug,
  ...params
}: GetVersionsParams): Promise<
  PaginatedApiResponse<ExternalAddonVersionType>,
> => {
  invariant(slug, 'slug is required');

  return callApi({
    apiState: api,
    auth: true,
    endpoint: `addons/addon/${slug}/versions/`,
    params,
  });
};
