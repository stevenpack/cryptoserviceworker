/* tslint:disable */
import {
  Router,
  IRouteHandler,
  RacerHandler,
  RequestContextBase,
  AllHandler,
  SpotPrice,
} from '../src/service-worker';

// hack: it gets imported elsewhere...
const fetch = {};
import { Request, Response } from 'node-fetch';

class DelayedResponder implements IRouteHandler {
  constructor(private delay: number, private response: any) {}

  handle(req: RequestContextBase): Promise<Response> {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve(new Response(this.response));
      }, this.delay);
    });
  }
}

async function pingApi(queryParams: string = ''): Promise<Response> {
  let req = new Request(
    'https://cryptoserviceworker.com/api/ping' + queryParams
  );
  let handler = new Router();
  return await handler.handle(req);
}

async function handleRequest(
  url: string,
  debug: boolean = true
): Promise<Response> {
  let req = new Request(url);
  if (debug) {
    console.log('requesting X-DEBUG=true');
    req.headers.append('X-DEBUG', 'true');
  }
  let router = new Router();
  let res = await router.handle(req);
  const debugStr = res.headers.get('X-DEBUG');
  console.log('X-Debug Decoded:');
  console.log(decodeURIComponent(debugStr));
  return res;
}

describe('unit', () => {
  test('Log header present on request', async () => {
    let res = await pingApi('?debug=true');
    expect(res.headers.has('X-DEBUG')).toBeTruthy();
    const debug = res.headers.get('X-DEBUG');
    console.log('X-Debug Decoded:');
    console.log(decodeURIComponent(debug));
    expect(debug.length).toBeGreaterThan(0);
  });

  test('Log header absent by default ', async () => {
    let res = await pingApi('?debug=xxx');
    expect(res.headers.has('X-DEBUG')).toBeFalsy();
  });

  test('Ping', async () => {
    let res = await pingApi();
    let result = await res.body;
    console.log(JSON.stringify(result));
    expect(res.status).toEqual(200);
  });

  test('UI', async () => {
    let res = await handleRequest('https://cryptoserviceworker.com/ui');
    let result = await res.body;
    console.log(JSON.stringify(result));
    expect(JSON.stringify(result)).toContain('<html>');
  });

  test('Fastest wins', async () => {
    let responders = [
      new DelayedResponder(10, 'fast'),
      new DelayedResponder(100, 'slow'),
    ];

    let request = new Request(
      'https://cryptoserviceworker.com/api/gdax/spot/btc-usd'
    );
    let req = new RequestContextBase(request);

    const racer = new RacerHandler();
    let res = await racer.race(req, responders);
    console.log(`winner: ${res.body}`);
    expect(res.body).toEqual('fast');
  });

  test('All returns all', async () => {
    let responders = [
      new DelayedResponder(100, '{"strongly": "typed"}'),
      new DelayedResponder(100, '{"very_strongly": "typed2"}'),
    ];
    let req = RequestContextBase.fromString(
      'http://cryptoserviceworker.com/api/all/spot/btc-usd'
    );
    console.log('Creating with delayed responders...');
    let handler = new AllHandler(responders);
    let res = await handler.handle(req);
    let obj = await res.json();
    console.log(JSON.stringify(obj));
    //check our objects are there.
    expect(obj[0].strongly).toEqual('typed');
    expect(obj[1].very_strongly).toEqual('typed2');
  });

  test('Routes should care about method', async () => {
    let req = new Request('https://cryptoserviceworker.com/api/ping', {
      method: 'POST',
    });
    let router = new Router();
    let res = await router.handle(req);
    expect(res).not.toBeNull();
    expect(res.status).toEqual(405); //not allowed
  });

  test('Debug info available', async () => {
    let res = await pingApi();
    expect(res.headers.get('X-DEBUG')).toBeNull();
    let res2 = await pingApi('?debug=true');
    expect(res2.headers.get('X-DEBUG')).not.toBeNull();

    console.info('DEBUG INFO:');
    console.info(res2.headers.get('X-DEBUG'));
  });
});

describe('integration', () => {
  test('INT: gdax spot', async () => {
    let res = await handleRequest(
      'https://cryptoserviceworker.com/api/direct/gdax/spot/btc-usd'
    );
    expect(res).not.toBeNull();
    expect(res.body).not.toBeNull();
    console.log(res.body);
    let spot: SpotPrice = await res.json();
    console.log(`${JSON.stringify(spot)}`);
    expect(spot.symbol).toEqual('btc-usd');
    expect(spot.price).not.toBeNull();
    let price = parseFloat(spot.price);
    expect(price).toBeGreaterThan(0);
  });

  test('INT: bitfinex spot', async () => {
    let res = await handleRequest(
      'https://cryptoserviceworker.com/api/direct/bitfinex/spot/btc-usd'
    );
    expect(res).not.toBeNull();
    expect(res.body).not.toBeNull();
    console.log(res.body);
    let spot: SpotPrice = await res.json();
    console.log(`${JSON.stringify(spot)}`);
    expect(spot.symbol).toEqual('btc-usd');
  });

  test('INT: fastest spot', async () => {
    let res = await handleRequest(
      'https://www.cryptoserviceworker.com/api/race/spot/btc-usd'
    );
    console.log('INT: race');
    console.log(res.body);
    let spot: SpotPrice = await res.json();
    console.log(`${JSON.stringify(spot)}`);
    expect(spot.symbol).toEqual('btc-usd');
  });

  test('INT: aggregate spot', async () => {
    let res = await handleRequest(
      'https://www.cryptoserviceworker.com/api/all/spot/btc-usd'
    );
    console.log('INT: all');
    let result = await res.json();
    console.log(result);
    //Check for multiple results
    //TODO: the results come back as an array of strings...
    expect(result[0].symbol).toEqual('btc-usd');
    expect(result[1].symbol).toEqual('btc-usd');
  });
});

//   test('INT: get with cache', async () => {
//     //get, expect no cache
//     let res = await handleRequest("http://cryptoserviceworker.com/api/direct/gdax/spot/btc-usd?max-age=60");
//     expect(res).not.toBeNull();
//     expect(res.status).toBe(200);
//     expect(res.headers.get("Age")).toBeNull();
//
//     //get again, expect cache (and be faster!)
//     res = await handleRequest("http://cryptoserviceworker.com/api/direct/gdax/spot/btc-usd?max-age=60");
//     expect(res).not.toBeNull();
//     expect(res.status).toBe(200);
//     let age = res.headers.get("Age");
//     console.log(`age: ${age}`);
//     expect(age).not.toBeNull();
//
//   })
// });

// test('bad requests are 400', () => {
//   let badUrls = [
//     'https://cryptoserviceworker.com/apiXX/race/spot/btc-usd',
//     'https://cryptoserviceworker.com/api/XXX/spot/btc-usd',
//     'https://cryptoserviceworker.com/api/race/XXX/btc-usd',
//     'https://cryptoserviceworker.com/api/race/spot/btcusd',
//     'https://cryptoserviceworker.com/rando',
//     'https://cryptoserviceworker.com/*&()&*)&(*UIKJ',
//   ];

//   let badRequests = badUrls.map(url => new Request(url, { method: 'GET' }));
//   let parser = new RequestParser();
//   for (let badReq of badRequests) {
//     let res = parser.validate(badReq);
//     expect(res).not.toBeNull();
//     expect(res.status).toEqual(400);
//   }
// });
