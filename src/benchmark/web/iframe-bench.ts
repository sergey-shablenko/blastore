import { buildSync } from '../../sync';

const KEYS_LIMIT = 100;
let sink = 0;
const consume = (x: any) => {
  const n = x && typeof x.v === 'number' ? x.v : 0;
  sink = (sink + (n | 0)) | 0;
};

function workload(name: string, iterations: number) {
  switch (name) {
    case 'raw localStorage - simple key': {
      for (let i = 0; i < iterations; i++) {
        localStorage.setItem('key', JSON.stringify({ v: i }));
        consume(JSON.parse(localStorage.getItem('key') as string));
      }
      break;
    }
    case 'raw localStorage': {
      for (let i = 0; i < iterations; i++) {
        const k = `key:${i % KEYS_LIMIT}`;
        localStorage.setItem(k, JSON.stringify({ v: i }));
        consume(JSON.parse(localStorage.getItem(k) as string));
      }
      break;
    }
    case 'blastore localStorage - simple key': {
      const blastore = buildSync({
        store: localStorage,
        validate: {
          key: (v: any) =>
            v === undefined || typeof v === 'object' ? v : new Error('invalid'),
        },
        serialize: {
          key: (v) => JSON.stringify(v),
        },
        deserialize: {
          key: (v) => JSON.parse(v as string),
        },
        validateOnSet: true,
      });
      for (let i = 0; i < iterations; i++) {
        blastore.set('key', { v: i });
        consume(blastore.get('key', null));
      }
      break;
    }
    case 'blastore localStorage': {
      const blastore = buildSync({
        store: localStorage,
        validate: {
          'key:${id}': (v: any) =>
            v === undefined || typeof v === 'object' ? v : new Error('invalid'),
        },
        serialize: {
          'key:${id}': (v) => JSON.stringify(v),
        },
        deserialize: {
          'key:${id}': (v) => JSON.parse(v as string),
        },
        validateOnSet: true,
      });
      for (let i = 0; i < iterations; i++) {
        const id = String(i % KEYS_LIMIT);
        const options = { variables: { id } };
        blastore.set('key:${id}', { v: i }, options);
        consume(blastore.get('key:${id}', null, options));
      }
      break;
    }
    case 'blastore localStorage - precompiled key': {
      const blastore = buildSync({
        store: localStorage,
        validate: {
          'key:${id}': (v: any) =>
            v === undefined || typeof v === 'object' ? v : new Error('invalid'),
        },
        serialize: {
          'key:${id}': (v) => JSON.stringify(v),
        },
        deserialize: {
          'key:${id}': (v) => JSON.parse(v as string),
        },
        validateOnSet: true,
      });
      const apis = new Array(KEYS_LIMIT);
      for (let i = 0; i < KEYS_LIMIT; i++) {
        apis[i] = blastore.buildKeyApi('key:${id}', {
          variables: { id: String(i) },
        });
      }
      for (let i = 0; i < iterations; i++) {
        const api = apis[i % KEYS_LIMIT];
        api.set({ v: i });
        consume(api.get(null));
      }
      break;
    }
    default:
      throw new Error('Unknown LS case: ' + name);
  }
}

export async function runOne(name: string, iterations: number) {
  // workload(name, 100_000);
  const t0 = performance.now();
  workload(name, iterations);
  const t1 = performance.now();
  const nsPerOp = ((t1 - t0) * 1e6) / iterations;
  return { name, time: nsPerOp.toFixed(4) + 'ns/op', delta: 'n/a', sink };
}
