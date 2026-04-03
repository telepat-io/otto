type AsyncTask<T> = () => Promise<T>;

export type SingleFlight = {
  run<T>(key: string, task: AsyncTask<T>): Promise<T>;
};

export function createSingleFlight(): SingleFlight {
  const inFlightByKey = new Map<string, Promise<unknown>>();

  return {
    async run<T>(key: string, task: AsyncTask<T>): Promise<T> {
      const existing = inFlightByKey.get(key) as Promise<T> | undefined;
      if (existing) {
        return existing;
      }

      const current = task();
      inFlightByKey.set(key, current as Promise<unknown>);

      try {
        return await current;
      } finally {
        if (inFlightByKey.get(key) === current) {
          inFlightByKey.delete(key);
        }
      }
    },
  };
}
