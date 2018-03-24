import fetch from 'node-fetch';
import { Request } from 'node-fetch';
import { Response } from 'node-fetch';
///===========///

export interface IHttpResponder {
  getResponse(req: RequestContext): Promise<ResponseContext>;
}

export interface ICryptoSpotApi {
  getSpot(symbol: string): Promise<SpotPrice>;
}

export interface ISymbolFormatter {
  format(symbol: Symbol) : string;
}

export class Symbol {
  constructor(public base: string, public target: string) {    
  }
}

export class SpotPrice {
  constructor(public symbol: string, public price: string, public utcTime: string, ) {    
  }
}

export class RequestContext {
  constructor(public symbol: Symbol, public action: string, public type: string, public provider: string = "") {    
  }
}

export class ResponseContext {
  constructor(public provider: string, public response: Response) {
  }
}

export class RequestHandler {
  
  constructor(private parser: RequestParser) {    
  }

  public async handle(req: Request) : Promise<Response> {
    let error = this.parser.validate(req);
    if (error) {
      return error;
    }

    let responders = [new GdaxSpotProvider(), new BitfinexSpotProvider()];
    let reqCtx = this.parser.parse(req);

    let requestType = `${reqCtx.action}-${reqCtx.type}`;

    switch (requestType) {
      case "race-spot":
        let racer = new ApiRacer();
        let responseCtx = await racer.race(reqCtx, responders);
        console.log("winner: " + responseCtx.provider);
        return responseCtx.response;
      default:
        return Promise.resolve(new Response("", { status: 405 }));
    }      
  }
}
}

/**
 * /api/race/spot/btc-usd
 * /api/aggregate/spot/btc-usd
 * /api/gdax/spot/btc-usd
 */
export class RequestParser {

  private types: string[];
  private providers: string[];
  private actions: string[];

  constructor() {
    this.actions = ["race", "all"];
    this.providers = ["gdax", "bitfinex"];
    this.types = ["spot"];
  }

  public parse(req: Request) : RequestContext {

    let parts = req.url.split('/');
    
    let firstOrDefault = (arr: string[], item: string): string => {
      let index = arr.findIndex(x => x === item);
      return index > -1 ? arr[index] : "";
    }

    //One or the other (action or provider);
    let action: string = firstOrDefault(this.actions, parts[4]);
    let provider: string = firstOrDefault(this.providers, parts[4]);
    let type = parts[5];
    let symbolParts = parts[6].split("-");
    let symbol = new Symbol(symbolParts[0], symbolParts[1]);
    
    return new RequestContext(symbol, action, type, provider);
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

      if (parts === null || parts.length !== 7) {
        return this.badRequest(help);
      }
  
      if (parts[3] !== "api") {
        return this.badRequest(help);
      }
  
      if (this.actions.indexOf(parts[4]) == -1 && this.providers.indexOf(parts[4]) == -1) {
        return this.badRequest(help);
      }

      if (this.types.indexOf(parts[5]) == -1) {
        return this.badRequest(help);
      }

      let isNullOrEmpty = (value: string) => {
        return (!value || value == undefined || value == "" || value.length == 0);
      }

      let symbol = parts[6];
      let symbolParts = parts[6].split("-");
      if (
        symbolParts.length !== 2 || //2 parts, base and target
        isNullOrEmpty(symbolParts[0]) || isNullOrEmpty(symbolParts[1])) //base and target
        {
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
}

export class ApiRacer {
  race(req: RequestContext, responders: IHttpResponder[]): Promise<ResponseContext> {
    let arr = responders.map(r => r.getResponse(req));
    return Promise.race(arr);
  }
}

/**
 * Returns a spot price from GDAX.
 *
 * Symbol format is <BASE>-<TARGETt>
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
  async getResponse(req: RequestContext): Promise<ResponseContext> {
    
    let fmt = new GdaxSymbolFormatter();
    let symbolFmt = fmt.format(req.symbol)
    let spot = await this.getSpot(symbolFmt);
    
    let response = new Response(JSON.stringify(spot));
    return new ResponseContext("gdax", response);
  }

  public async getSpot(symbol: string): Promise<SpotPrice> {
    let res = await fetch(`https://api.gdax.com/products/${symbol}/ticker`);
    return this.parseSpot(symbol, res);
  }

private async parseSpot(symbol: string, res: Response): Promise<SpotPrice> {
    let json: any = await res.json();
    return new SpotPrice(symbol, json.price, json.time)
  }
}

export class GdaxSymbolFormatter implements ISymbolFormatter {
  format(symbol: Symbol): string {
    return `${symbol.base}-${symbol.target}`
  }
}

/**
 * Bitfinex Provider
 * 
 * Symbola format is <base><target>
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

  async getResponse(req: RequestContext): Promise<ResponseContext> {

    let fmt = new BitfinexSymbolFormatter();
    let symbolFmt = fmt.format(req.symbol)
    let spot = await this.getSpot(symbolFmt)
    
    let response = new Response(JSON.stringify(spot));
    return new ResponseContext("bitfinex", response);
  }

  async getSpot(symbol: string): Promise<SpotPrice> {
    let res = await fetch(`https://api.bitfinex.com/v1/pubticker/${symbol}`);
    return this.parseSpot(symbol, res);
  }

  private async parseSpot(symbol: string, res: Response): Promise<SpotPrice> {
    let json: any = await res.json();
    return new SpotPrice(symbol, json.last_price, new Date(parseFloat(json.timestamp) * 1000).toISOString())
  }
}

export class BitfinexSymbolFormatter implements ISymbolFormatter {
  format(symbol: Symbol): string {
    return `${symbol.base}${symbol.target}`
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
