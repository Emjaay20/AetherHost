export const CACHE_MANAGER = 'CACHE_MANAGER';
export const CacheModule = {
  register: jest.fn().mockReturnValue({
    module: class {},
    providers: [],
    exports: []
  })
};
export interface Cache {
  get: jest.Mock;
  set: jest.Mock;
  del: jest.Mock;
}
