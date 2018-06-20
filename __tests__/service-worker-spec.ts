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

  test('Ping', async () => {
    let res = await pingApi();
    let result = await res.body;
    console.log(JSON.stringify(result));
    expect(res.status).toEqual(200);
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

