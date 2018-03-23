import { ApiRacer, IHttpResponder, GdaxSpotProvider, SpotPrice, BitfinexSpotProvider, RequestParser } from '../src/service-worker';
import { Request } from 'node-fetch';
import { Response } from 'node-fetch';

const racer = new ApiRacer();

class DelayedResponder implements IHttpResponder {
  constructor(private delay: number, private response: string) {}

  getResponse(req: Request): Promise<Response> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(new Response(this.response));
      }, this.delay);
    });
  }
}


test('request parser GET only', () => {
  let req = new Request("https://cryptoserviceworker.com/api/race/spot/btc-usd", {
    method: "POST"
  })
  let parser = new RequestParser();
  let response = parser.validate(req);

  expect(response).not.toBeNull();
  expect(response.status).toEqual(405); //method not allowed
});

test('bad requests are 400', () => {

  let badUrls = [
    "https://cryptoserviceworker.com/apiXX/race/spot/btc-usd",
    "https://cryptoserviceworker.com/api/XXX/spot/btc-usd",
    "https://cryptoserviceworker.com/api/race/XXX/btc-usd",
    "https://cryptoserviceworker.com/rando",
    "https://cryptoserviceworker.com/*&()&*)&(*UIKJ",
  ];

  let badRequests = badUrls.map(url => new Request(url, { method: "GET" }))
  let parser = new RequestParser();
  for (let badReq of badRequests) {
    let res = parser.validate(badReq);
    expect(res).not.toBeNull();
    expect(res.status).toEqual(400);
  }
});

test('good requests do not trigger validation errors', () => {

  let goodUrls = [
    "https://cryptoserviceworker.com/api/race/spot/btc-usd",
    "https://cryptoserviceworker.com/api/all/spot/btc-usd",
    "https://cryptoserviceworker.com/api/gdax/spot/btc-usd",
    "https://cryptoserviceworker.com/api/race/spot/ltc-aud",
  ];

  let badRequests = goodUrls.map(url => new Request(url, { method: "GET" }))
  let parser = new RequestParser();
  for (let badReq of badRequests) {
    let res = parser.validate(badReq);
    expect(res).toBeNull();
  }
});

test('fastest wins', async () => {
  let responders = [
    new DelayedResponder(10, 'fast'),
    new DelayedResponder(100, 'slow'),
  ];
  let req = new Request('btc-usd');
  let res = await racer.race(req, responders);
  console.log(`winner: ${res.body}`);
  expect(res.body).toEqual('fast');
});

test('INT: gdax spot', async() => {
  let gdax = new GdaxSpotProvider();
  let res = await gdax.getResponse(new Request("http://somerequest/abc"))
  expect(res).not.toBeNull();
  expect(res.body).not.toBeNull();
  let spot: SpotPrice = await res.json();
  console.log(`${JSON.stringify(spot)}`);
  expect(spot.code).toEqual("btc-usd");
}); 

test('INT: bitfinex spot', async() => {
  let bitfinex = new BitfinexSpotProvider();
  let res = await bitfinex.getResponse(new Request("http://somerequest/abc"))
  expect(res).not.toBeNull();
  expect(res.body).not.toBeNull();
  let spot: SpotPrice = await res.json();
  console.log(`${JSON.stringify(spot)}`);
  expect(spot.code).toEqual("btcusd");
}); 