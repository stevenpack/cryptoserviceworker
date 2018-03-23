import fetch from 'node-fetch';
import { Request } from 'node-fetch';
import { Response } from 'node-fetch';
///===========///

export class ApiRacer {
  race(req: Request, responders: IHttpResponder[]): Promise<Response> {
    let arr = responders.map(r => r.getResponse(req));
    return Promise.race(arr);
  }
}

export interface IHttpResponder {
  getResponse(req: Request): Promise<Response>;
}

export interface ICryptoSpotApi {
  getSpot(code: string): Promise<SpotPrice>;
}

export class SpotPrice {
  constructor(public code: string, public price: string, public utcTime: string, ) {    
  }
}

/**
 * Returns a spot price from GDAX.
 * 
 * Code format is <BASE>-<TARGETt>
 * 
 * GDAX response looks like this:
 * {
 *  "trade_id":40240431,
 *  "price":"8371.58000000",
 *  "size":"0.01668154",
 *  "bid":"8371.57",
 *  "ask":"8371.58",
 *  "volume":"17210.40916422",
 *  "time":"2018-03-23T05:23:59.807000Z"
 * }
 */
export class GdaxSpotProvider implements ICryptoSpotApi, IHttpResponder {
  async getResponse(req: Request): Promise<Response> {
    
    let code = "btc-usd"; req.url;//TODO: extract
    let spot = await this.getSpot(code)
    
    return new Response(JSON.stringify(spot));
  }

  public async getSpot(code: string): Promise<SpotPrice> {
    let res = await fetch(`https://api.gdax.com/products/${code}/ticker`);
    return this.parseSpot(code, res);
  }

private async parseSpot(code: string, res: Response): Promise<SpotPrice> {
    let json: any = await res.json();
    return new SpotPrice(code, json.price, json.time)
  }
}

/**
 * Bitfinex Provider
 * 
 * Code format is <base><target>
 * 
* {
    "mid":"244.755",
    "bid":"244.75",
    "ask":"244.76",
    "last_price":"244.82",
    "low":"244.2",
    "high":"248.19",
    "volume":"7842.11542563",
    "timestamp":"1444253422.348340958"
  }
 */
export class BitfinexSpotProvider implements ICryptoSpotApi, IHttpResponder {

  async getResponse(req: Request): Promise<Response> {
    let code = "btcusd"; req.url;//TODO: extract
    let spot = await this.getSpot(code)
    
    return new Response(JSON.stringify(spot));
  }
  async getSpot(code: string): Promise<SpotPrice> {
    let res = await fetch(`https://api.bitfinex.com/v1/pubticker/${code}`);
    return this.parseSpot(code, res);
  }

  private async parseSpot(code: string, res: Response): Promise<SpotPrice> {
    let json: any = await res.json();
    return new SpotPrice(code, json.last_price, new Date(parseFloat(json.timestamp) * 1000).toISOString())
  }
}

// let a = new CoinbaseProvider();
// let spot = a.getSpot('BTC-USD');

// window.addEventListener("fetch", event => {
//   event.respondWith(fetchAndReplace(event.request))
// })

// async function fetchAndReplace(request: Request) {
//   // Fetch from origin server.
//   let response = await fetch(request)

//   // Make sure we only modify text, not images.
//   let type = response.headers.get("Content-Type") || ""
//   if (!type.startsWith("text/")) {
//     // Not text. Don't modify.
//     return response
//   }

//   // Read response body.
//   let text = await response.text()

//   // Modify it.
//   let modified = text.replace(
//       /Worker/g, "Minion")

//   // Return modified response.
//   return new Response(modified, {
//     status: response.status,
//     statusText: response.statusText,
//     headers: response.headers
//   })
// }
