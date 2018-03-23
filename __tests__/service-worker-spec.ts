import { ApiRacer, IHttpResponder, GdaxSpotProvider, SpotPrice, BitfinexSpotProvider } from '../src/service-worker';
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