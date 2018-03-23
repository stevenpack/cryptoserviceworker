import fetch from 'node-fetch';
import { Request } from 'node-fetch';
import { Response } from 'node-fetch';
///===========///

export interface IHttpResponder {
  getResponse(req: Request): Promise<Response>;
}

export interface ICryptoSpotApi {
  getSpot(code: string): Promise<SpotPrice>;
}

/**
 * /api/race/spot/btc-usd
 * /api/aggregate/spot/btc-usd
 *
 * /api/gdax/spot/btc-usd
 */
export class RequestParser {

  types: string[];
  providers: string[];
  actions: string[];
  
  constructor() {
    this.actions = ["race", "all"];
    this.providers = ["gdax", "bitfinex"];
    this.types = ["spot"];
  }

  public validate(req: Request) {
    if (req.method.toUpperCase() !== "GET") {
      return new Response("", {
        status: 405,
        statusText: "Only GET supported at thsi time"
      } )
    }    

    const help = "The API request should be of the form https://cryptoserviceworker.com/api/[race]|[all]|[provider]/spot/<base>|<target>\r\n" +
    " for example, https://cryptoserviceworker.com/api/race/btc-usd or https://cryptoserviceworker.com/api/gdax/btc-usd\r\n";

    try{
      let parts = req.url.split('/');
      //0 'https:',
      //1   '',
      //2   'cryptoserviceworker.com',
      //3   'api',
      //4   'race',
      //5   'spot',
      //6   'btc-usd' 
  
      if (parts[3] !== "api") {
        return this.badRequest(help);
      }
  
      if (this.actions.indexOf(parts[4]) == -1 && this.providers.indexOf(parts[4]) == -1) {
        return this.badRequest(help);
      }

      if (this.types.indexOf(parts[5]) == -1) {
        return this.badRequest(help);
      }

    } catch (e) {
      //TOOD: debug header if enabled.
      return this.badRequest(help);
    }
    return null;
  }

  private badRequest(statusText: string): Response {
    return new Response("", {
      status: 400,
      statusText: statusText
    })
  }

  private parse(url: string) {
    
    // let  = url.split("/")
    // let scheme = parts[0];

  }
}

export class ApiRacer {
  race(req: Request, responders: IHttpResponder[]): Promise<Response> {
    let arr = responders.map(r => r.getResponse(req));
    return Promise.race(arr);
  }
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
