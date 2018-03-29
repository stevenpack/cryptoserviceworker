import {
  ApiRacer,
  IHttpResponder,
  GdaxSpotProvider,
  SpotPrice,
  BitfinexSpotProvider,
  RequestParser,
  RequestContext,
  ResponseContext,
  RequestHandler,
} from '../src/service-worker';
import { Request } from 'node-fetch';
import { Response } from 'node-fetch';

const racer = new ApiRacer();

class DelayedResponder implements IHttpResponder {
  constructor(private delay: number, private response: string) {}

  getResponse(req: RequestContext): Promise<ResponseContext> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(new ResponseContext('delayer', new Response(this.response)));
      }, this.delay);
    });
  }
}

test('xLogger return log header', async () => {
  let req = new Request('https://cryptoserviceworker.com/api/ping');
  let handler = new RequestHandler();
  let res = await handler.handle(req);

  expect(res.headers.has('CSW-DEBUG')).toBeTruthy();
});

test('xINT: ping', async () => {
  let req = new Request('https://cryptoserviceworker.com/api/ping');
  let handler = new RequestHandler();
  let res = await handler.handle(req);
  console.log('INT: ping');
  let result = await res.body;
  console.log(JSON.stringify(result));
  expect(res.status).toEqual(200);
});

test('request parser GET only', () => {
  let req = new Request(
    'https://cryptoserviceworker.com/api/race/spot/btc-usd',
    {
      method: 'POST',
    }
  );
  let parser = new RequestParser();
  let response = parser.validate(req);

  expect(response).not.toBeNull();
  expect(response.status).toEqual(405); //method not allowed
});

test('bad requests are 400', () => {
  let badUrls = [
    'https://cryptoserviceworker.com/apiXX/race/spot/btc-usd',
    'https://cryptoserviceworker.com/api/XXX/spot/btc-usd',
    'https://cryptoserviceworker.com/api/race/XXX/btc-usd',
    'https://cryptoserviceworker.com/api/race/spot/btcusd',
    'https://cryptoserviceworker.com/rando',
    'https://cryptoserviceworker.com/*&()&*)&(*UIKJ',
  ];

  let badRequests = badUrls.map(url => new Request(url, { method: 'GET' }));
  let parser = new RequestParser();
  for (let badReq of badRequests) {
    let res = parser.validate(badReq);
    expect(res).not.toBeNull();
    expect(res.status).toEqual(400);
  }
});

test('good requests do not trigger validation errors', () => {
  let goodUrls = [
    'https://cryptoserviceworker.com/api/race/spot/btc-usd',
    'https://cryptoserviceworker.com/api/all/spot/btc-usd',
    'https://cryptoserviceworker.com/api/gdax/spot/btc-usd',
    'https://cryptoserviceworker.com/api/race/spot/ltc-aud',
  ];

  let badRequests = goodUrls.map(url => new Request(url, { method: 'GET' }));
  let parser = new RequestParser();
  for (let badReq of badRequests) {
    let res = parser.validate(badReq);
    expect(res).toBeNull();
  }
});

test('parse action requests', () => {
  let url = 'https://cryptoserviceworker.com/api/race/spot/btc-usd';
  let parser = new RequestParser();
  let reqCtx = parser.parse(new Request(url, { method: 'GET' }));
  expect(reqCtx.action).toEqual('race');
  expect(reqCtx.provider).toEqual('');
});

test('parse provider requests', () => {
  let url = 'https://cryptoserviceworker.com/api/gdax/spot/btc-usd';
  let parser = new RequestParser();
  let reqCtx = parser.parse(new Request(url, { method: 'GET' }));
  expect(reqCtx.action).toEqual('');
  expect(reqCtx.provider).toEqual('gdax');
});

test('fastest wins', async () => {
  let responders = [
    new DelayedResponder(10, 'fast'),
    new DelayedResponder(100, 'slow'),
  ];
  let req = new Request(
    'https://cryptoserviceworker.com/api/gdax/spot/btc-usd'
  );
  let parser = new RequestParser();
  let reqCtx = parser.parse(req);
  let res = await racer.race(reqCtx, responders);
  console.log(`winner: ${res.provider}`);
  expect(res.response.body).toEqual('fast');
});

test('INT: gdax spot', async () => {
  let gdax = new GdaxSpotProvider();
  let req = new Request(
    'https://cryptoserviceworker.com/api/gdax/spot/btc-usd'
  );
  let parser = new RequestParser();
  let reqCtx = parser.parse(req);
  let res = await gdax.getResponse(reqCtx);
  expect(res).not.toBeNull();
  expect(res.response.body).not.toBeNull();
  let spot: SpotPrice = await res.response.json();
  console.log(`${JSON.stringify(spot)}`);
  expect(spot.symbol).toEqual('btc-usd');
});

test('INT: bitfinex spot', async () => {
  let bitfinex = new BitfinexSpotProvider();
  let req = new Request(
    'https://cryptoserviceworker.com/api/bitfinex/spot/btc-usd'
  );
  let parser = new RequestParser();
  let reqCtx = parser.parse(req);
  let res = await bitfinex.getResponse(reqCtx);
  expect(res).not.toBeNull();
  expect(res.response.body).not.toBeNull();
  let spot: SpotPrice = await res.response.json();
  console.log(`${JSON.stringify(spot)}`);
  expect(spot.symbol).toEqual('btc-usd');
});

test('INT: fastest spot', async () => {
  let req = new Request(
    'https://cryptoserviceworker.com/api/race/spot/btc-usd'
  );
  let handler = new RequestHandler();
  let res = await handler.handle(req);
  console.log('INT: fastest');
  console.log(res.body);
});

test('INT: aggregate spot', async () => {
  let req = new Request('https://cryptoserviceworker.com/api/all/spot/btc-usd');
  let handler = new RequestHandler();
  let res = await handler.handle(req);
  console.log('INT: all');
  let result = await res.json();
  console.log(JSON.stringify(result));
  //Check for multiple results
  //TODO: string formatting...
  // expect(result["gdax"].symbol).toEqual("btc-usd")
  // expect(result["bitfinex"].symbol).toEqual("btc-usd");
  // expect(result["xxx"]).toBeUndefined();
});
