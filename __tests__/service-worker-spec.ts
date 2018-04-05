import {
  Router,
  IRouteHandler,
  RacerHandler,
  RequestContextBase,
  AllHandler,
  SpotPrice,
  WindowCache,
  CacheEntry
//   GdaxSpotProvider,
//   SpotPrice,
//   BitfinexSpotProvider,
//   RequestParser,
//   RequestContext,
//   ResponseContext,
//   RequestHandler,
} from '../src/service-worker';
import { Request } from 'node-fetch';
import { Response } from 'node-fetch';

class DelayedResponder implements IRouteHandler {
  
  constructor(private delay: number, private response: any) {}

  handle(req: RequestContextBase): Promise<Response> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(new Response(this.response));
      }, this.delay);
    });
  }
}

async function pingApi(queryParams: string = ""): Promise<Response> {
  let req = new Request('https://cryptoserviceworker.com/api/ping' + queryParams);
  let handler = new Router();
  return await handler.handle(req);
}

test('Log header present on request', async () => {
  let res = await pingApi("?debug=true");
  expect(res.headers.has('X-DEBUG')).toBeTruthy();
  const debug = res.headers.get('X-DEBUG');
  console.log("X-Debug Decoded:");
  console.log(decodeURIComponent(debug));
  expect(debug.length).toBeGreaterThan(0);
});

test('Log header absent by default ', async () => {
  let res = await pingApi("?debug=xxx");
  expect(res.headers.has('X-DEBUG')).toBeFalsy();
});


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

test('All returns all', async() => {
  let responders = [
    new DelayedResponder(50, "text"),
    new DelayedResponder(75, "text2"),    
    new DelayedResponder(100, "{\"strongly\": \"typed\"}"),
    new DelayedResponder(100, "{\"very_strongly\": \"typed2\"}")    
  ];
  let req = RequestContextBase.fromString("http://cryptoserviceworker.com/api/all/spot/btc-usd");
  let aggregator = new AllHandler();
  let res = await aggregator.all(req, responders);
  let obj = JSON.parse(await res.text());
  //check our objects are there.
  expect(obj).toContain("text");
  expect(obj).toContain("text2");
  //TODO: parsing of json
});

async function handleRequest(url: string): Promise<Response> {
  let req = new Request(url);
  let router = new Router();
  let res = await router.handle(req);
  return res;
}

test('Routes should care about method', async () => {
  let req = new Request(
    'https://cryptoserviceworker.com/api/ping', {
      method: 'POST',
    }
  );
  let router = new Router();
  let res = await router.handle(req);
  expect(res).not.toBeNull();
  expect(res.status).toEqual(405); //not allowed
});

test('INT: gdax spot', async () => {
  let res = await handleRequest('https://cryptoserviceworker.com/api/direct/gdax/spot/btc-usd');
  expect(res).not.toBeNull();
  expect(res.body).not.toBeNull();
  console.log(res.body);
  let spot: SpotPrice = await res.json();
  console.log(`${JSON.stringify(spot)}`);
  expect(spot.symbol).toEqual('btc-usd');
});

test('INT: bitfinex spot', async () => {
  let res = await handleRequest('https://cryptoserviceworker.com/api/direct/bitfinex/spot/btc-usd');
  expect(res).not.toBeNull();
  expect(res.body).not.toBeNull();
  console.log(res.body);
  let spot: SpotPrice = await res.json();
  console.log(`${JSON.stringify(spot)}`);
  expect(spot.symbol).toEqual('btc-usd');
});


test('INT: fastest spot', async () => {
  let res = await handleRequest('https://cryptoserviceworker.com/api/race/spot/btc-usd');
  console.log('INT: race');
  console.log(res.body);
  let spot: SpotPrice = await res.json();
  console.log(`${JSON.stringify(spot)}`);
  expect(spot.symbol).toEqual('btc-usd');
});

test('INT: aggregate spot', async () => {
  let res = await handleRequest('https://cryptoserviceworker.com/api/all/spot/btc-usd');
  console.log('INT: all');
  let result = await res.json();
  console.log(result);
  //Check for multiple results
  //TODO: the results come back as an array of strings...
  expect(JSON.parse(result[0]).symbol).toEqual("btc-usd");
  expect(JSON.parse(result[1]).symbol).toEqual("btc-usd");
});

test('cache set and get', () => {
  let cache = new WindowCache({});
  let res = new Response("test");
  let item = new CacheEntry(res);  
  cache.setEntry("a", item);
  let cachedItem = cache.getEntry<Response>("a");
  expect(cachedItem.item.body).toEqual("test");
});

test('cache get with max-age', async () => {
  let cache = new WindowCache({});
  let res = new Response("test");
  let item = new CacheEntry(res);  
  cache.setEntry("a", item);
  let cachedItem = cache.tryGetEntry<Response>("a", 50);
  expect(cachedItem).not.toBeNull(); //should still be there 
  setTimeout(() => {
    let expiredCachedItem = cache.tryGetEntry<Response>("a", 50);
    console.log("Tried to get item with 50ms expiry after 100ms. Got: " + expiredCachedItem);
    expect(expiredCachedItem).toBeNull(); //should have expired after 100ms
  }, 100);
});

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
