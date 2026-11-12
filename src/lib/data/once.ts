/** Один запит на процес (сторінки EN/UK і метадані беруть ті самі дані); збій не кешується — наступний виклик повторить запит. */
export function once<T>(load: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | undefined;
  return () =>
    (promise ??= load().catch((e: unknown) => {
      promise = undefined;
      throw e;
    }));
}
