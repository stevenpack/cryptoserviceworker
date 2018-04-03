import {
  Router,
  IRouteHandler,
  RacerHandler,
  RequestContextBase,
  AllHandler
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

// test('good requests do not trigger validation errors', () => {
//   let goodUrls = [
//     'https://cryptoserviceworker.com/api/race/spot/btc-usd',
//     'https://cryptoserviceworker.com/api/all/spot/btc-usd',
//     'https://cryptoserviceworker.com/api/gdax/spot/btc-usd',
//     'https://cryptoserviceworker.com/api/race/spot/ltc-aud',
//   ];

//   let badRequests = goodUrls.map(url => new Request(url, { method: 'GET' }));
//   let parser = new RequestParser();
//   for (let badReq of badRequests) {
//     console.log("Trying: " + badReq.url);
//     let res = parser.validate(badReq);
//     expect(res).toBeNull();
//   }
// });

// test('parse action requests', () => {
//   let url = 'https://cryptoserviceworker.com/api/race/spot/btc-usd';
//   let parser = new RequestParser();
//   let reqCtx = parser.parse(new Request(url, { method: 'GET' }));
//   expect(reqCtx.action).toEqual('race');
//   expect(reqCtx.provider).toEqual('');
// });

// test('parse provider requests', () => {
//   let url = 'https://cryptoserviceworker.com/api/gdax/spot/btc-usd';
//   let parser = new RequestParser();
//   let reqCtx = parser.parse(new Request(url, { method: 'GET' }));
//   expect(reqCtx.action).toEqual('');
//   expect(reqCtx.provider).toEqual('gdax');
// });



// test('INT: gdax spot', async () => {
//   let gdax = new GdaxSpotProvider();
//   let req = new Request(
//     'https://cryptoserviceworker.com/api/gdax/spot/btc-usd'
//   );
//   let parser = new RequestParser();
//   let reqCtx = parser.parse(req);
//   let res = await gdax.getResponse(reqCtx);
//   expect(res).not.toBeNull();
//   expect(res.response.body).not.toBeNull();
//   let spot: SpotPrice = await res.response.json();
//   console.log(`${JSON.stringify(spot)}`);
//   expect(spot.symbol).toEqual('btc-usd');
// });

// test('INT: bitfinex spot', async () => {
//   let bitfinex = new BitfinexSpotProvider();
//   let req = new Request(
//     'https://cryptoserviceworker.com/api/bitfinex/spot/btc-usd'
//   );
//   let parser = new RequestParser();
//   let reqCtx = parser.parse(req);
//   let res = await bitfinex.getResponse(reqCtx);
//   expect(res).not.toBeNull();
//   expect(res.response.body).not.toBeNull();
//   let spot: SpotPrice = await res.response.json();
//   console.log(`${JSON.stringify(spot)}`);
//   expect(spot.symbol).toEqual('btc-usd');
// });

// test('INT: fastest spot', async () => {
//   let req = new Request(
//     'https://cryptoserviceworker.com/api/race/spot/btc-usd'
//   );
//   let handler = new RequestHandler();
//   let res = await handler.handle(req);
//   console.log('INT: fastest');
//   console.log(res.body);
// });

// test('INT: aggregate spot', async () => {
//   let req = new Request('https://cryptoserviceworker.com/api/all/spot/btc-usd');
//   let handler = new RequestHandler();
//   let res = await handler.handle(req);
//   console.log('INT: all');
//   let result = await res.json();
//   console.log(JSON.stringify(result));
//   //Check for multiple results
//   expect(result["gdax"].symbol).toEqual("btc-usd")
//   expect(result["bitfinex"].symbol).toEqual("btc-usd");
// });

// test('500 returns error info in debug mode', async() => {
//   expect(false).toBeTruthy("If debug is on, we want the error info");
// });
