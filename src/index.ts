import {
  describe, beforeEach, afterEach, vi, expect,
  type Mock,
} from 'vitest';

export function lazy<T>(
  creator: () => T,
  cleanup?: (object: T) => void
): T & (() => T) {
  let current: T | undefined;
  function doCreate() {
    if (!current) {
      current = creator();
    }

    return current;
  }

  afterEach(() => {
    if (cleanup && current != null) {
      cleanup(current);
    }
    current = undefined;
  });

  return new Proxy(() => {}, {
    apply() {
      return doCreate();
    },
    get(_obj: {}, prop) {
      if (prop === 'calls') {
        return;
      }

      return new Proxy(() => {}, {
        apply(_target, _thisArg, argumentsList) {
          const receiver = doCreate();

          const method = (receiver as any)[prop];
          if (method instanceof Function) {
            return method.apply(current, argumentsList);
          }
        },
      });
    },
  }) as T & (() => T);
}

export function vary<T>(initialValue: T): {
  (): T;
  (newValue: T): void;
  new (newValue: T): void;
  each(variations: ReadonlyArray<T>): ReturnType<typeof describe.each>;
} {
  let currentValue: T;
  const setCurrentValue = (newValue: T) => {
    const { testPath } = expect.getState();
    if (testPath) {
      currentValue = newValue;
    } else {
      beforeEach(() => {
        currentValue = newValue;
      });
    }
  }
  setCurrentValue(initialValue);

  class Base {
    static each(
      variations: ReadonlyArray<T>
    ): (name: string, fn: () => unknown, timeout?: number) => void {
      return (name, fn, timeout) => {
        describe.each(variations)(
          name,
          (variation) => {
            beforeEach(() => {
              currentValue = variation;
            });

            fn();
          },
          timeout
        );
      };
    }
  }

  return new Proxy(Base, {
    apply(_target, _this, args) {
      if (args.length === 0) {
        return currentValue;
      } else if (args.length === 1) {
        setCurrentValue(args[0] as typeof currentValue);
        return;
      } else {
        console.error(args);
        throw Error(
          `Can only call with 0 or 1 args not ${args.length} ${args}.`
        );
      }
    },
    construct(_target: {}, [newValue]) {
      setCurrentValue(newValue);
      return {};
    },
  }) as unknown as {
    (): T;
    (newValue: T): void;
    new (newValue: T): void;
    each(variations: ReadonlyArray<T>): ReturnType<typeof describe.each>;
  };
}

export function fresh<T = ReturnType<typeof vi.fn>>(
  creator?: () => T,
  refresher?: (object: T) => void,
): Array<T> & (() => T) {
  const _creator = creator ?? vi.fn as () => T;
  const _refresher = refresher ?? ((mock: Mock) => mock.mockClear()) as (object: T) => void;
  
  function create() {
    const object = _creator();
    afterEach(() => {
      _refresher(object);
    });
    return object;
  }

  const iterable = {
    *[Symbol.iterator]() {
      while (true) {
        yield create();
      }
    },
  };

  return new Proxy(() => {}, {
    get(_obj: {}, prop) {
      if (prop === 'length') {
        return Infinity;
      }

      if (typeof prop === 'string') {
        const index = parseInt(prop, 10);
        if (index.toString() === prop) {
          const object = _creator();
          afterEach(() => {
            _refresher(object);
          });
          return object;
        }
      }

      return (iterable as any)[prop];
    },
    apply() {
      return create();
    },
  }) as Array<T> & (() => T);
}