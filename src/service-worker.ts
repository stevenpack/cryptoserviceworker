import fetch from 'node-fetch';
import { Request } from 'node-fetch';
import { Response } from 'node-fetch';
import { URL } from 'url';

//==== Framework ====//

export interface IRouter {
  route(req: RequestContextBase): IRouteHandler
}

/**
 * A route
 * 
 * TODO: perf: Big object just for matching. Only 1 will be used.
 *       could be match and just a factory method.
 */
export interface IRoute {
  match(req: RequestContextBase): IRouteHandler | null;
}

export interface IRouteHandler {
    handle(req: RequestContextBase): Promise<Response>;
}

export interface IInterceptor {
  process(req: RequestContextBase, res: Response): void;
}

/**
 * Interfce for adding log information to requests and responses
 */
export interface ILogDecorator {
  intercept(req: ILogger, res: ILogger) : Response;
}

export interface ILogInjector {
  inject(log: string, res: Response): void;
}

export interface ILogger {
  log(logLine: string): void;
  getLines() : string[];
}

/**
 * Request with logging added
 */
export class RequestContextBase implements ILogger { 

  public logLines: string[] = [];
  public url: URL;
  constructor(public request: Request) {
    this.url = new URL(request.url);
  }

  public static fromString(str: string) {
    return new RequestContextBase(new Request(str));
  }

  log(logLine: string): void {
    console.log(logLine);
    this.logLines.push(logLine);
  }
  getLines(): string[] {
    return this.logLines;
  } 
}

export class Router implements IRouter {

  routes: IRoute[];
  interceptors: IInterceptor[];

  constructor() {
    //no ioc
    this.routes = [
      new PingRoute(),
      new RaceRoute(),
      new AllRoute(),
      new DirectRoute()
    ];
    this.interceptors = [new LogInterceptor];
  }

  async handle(request: Request): Promise<Response> {
    let req = new RequestContextBase(request);
    let handler = this.route(req);
    let res = await handler.handle(req);
    this.interceptors.forEach(i => i.process(req, res));
    return res;
  }

  route(req: RequestContextBase): IRouteHandler {
    let handler: IRouteHandler | null = this.match(req);
    if (handler) {
      req.log(`Found handler for ${req.url.pathname}`);
      return handler;
    }
    return new NotFoundHandler();
  }
 
  match(req: RequestContextBase): IRouteHandler | null {
    for (let route of this.routes) {
      let handler = route.match(req);
      if (handler != null)
        return handler;
    }
    return null;
  }
}

export class LogInterceptor implements IInterceptor {
  process(req: RequestContextBase, res: Response): void {

    if (req.url.searchParams.get("debug") !== "true") {
      return;
    }
    req.log("Executing log interceptor");
    let logStr = encodeURIComponent(req.getLines().join("\n"));
    this.inject(logStr, res); 
  }
  inject(log: string, res: Response): void {
    res.headers.append("X-DEBUG", log);
  }
}

// Common handlers

/**
 * 404 Not Found
 */
export class NotFoundHandler implements IRouteHandler {
  validate(req: RequestContextBase): Response | null {
    return null;
  }
  async handle(req: RequestContextBase): Promise<Response> {
    return new Response(undefined, {
      status: 404,
      statusText: "Unknown route"
    })
  }
}

/**
 * 405 Method Not Allowed
 */
export class MethodNotAllowedHandler implements IRouteHandler {
  validate(req: RequestContextBase): Response | null {
    return null;
  }
  async handle(req: RequestContextBase): Promise<Response> {
    return new Response(undefined, {
      status: 405,
      statusText: "Method not allowed"
    })
  }
}

//==== API ====//
export class PingRoute implements IRoute {
  match(req: RequestContextBase): IRouteHandler | null {
    if (req.request.method !== "GET") {
      return new MethodNotAllowedHandler();
    }
    if (req.url.pathname.startsWith("/api/ping")) {
      return new PingRouteHandler();
    }
    return null;
  }
}

export class PingRouteHandler implements IRouteHandler {
  async handle(req: RequestContextBase): Promise<Response> {
    const pong = "pong;"
    let res = new Response(pong);
    req.log(`Responding with ${pong} and ${res.status}`);
    return new Response(pong);
  }
}

export class BadRequest {
  public static fromString(statusText: string): Response {
    return new Response(undefined, {status: 400, statusText: statusText})
  }
}

export class RaceRoute implements IRoute {
  match(req: RequestContextBase): IRouteHandler | null {
    let url = new URL(req.request.url);
    if (url.pathname.startsWith("/api/race/")) {
      //TODO: configure it. Here?
      return new RacerHandler()
    }
    return null;
  }
}

export class RacerHandler implements IRouteHandler {

  constructor(private responders: IRouteHandler[] = []) {}

  handle(req: RequestContextBase): Promise<Response> {
    return this.race(req, this.responders);
  }

  async race(req: RequestContextBase, responders: IRouteHandler[]): Promise<Response> {
    let arr = responders.map(r => r.handle(req));
    return Promise.race(arr);
  }
}

export class AllRoute implements IRoute {
  match(req: RequestContextBase): IRouteHandler | null {
    
    if (req.url.pathname.startsWith("/api/all/")) {
      //TODO: configure. here?
      return new AllHandler();
    }
    return null;
  }
}

export class AllHandler implements IRouteHandler {
  constructor(private handlers: IRouteHandler[] = []) {}

  handle(req: RequestContextBase): Promise<Response> {    
    return this.all(req, this.handlers);
  }

  async all(req: RequestContextBase, handlers: IRouteHandler[] ): Promise<Response> {    
    let p = await Promise.all(handlers.map(h => h.handle(req)));        
    let arr = p.map(p => p.body);
    return new Response(JSON.stringify(arr));    
  }
}

export class DirectRoute implements IRoute {
  match(req: RequestContextBase): IRouteHandler | null {
    if (req.url.pathname.startsWith("/api/direct")) {
      console.log("Direct...")
      //Split and filter any empty
      let parts = req.url.pathname.split("/").filter(val => val);
      console.log(parts);
      if (parts.length > 2) {
        let provider = parts[2];
        switch (provider) {
          case "gdax":
            return new GdaxSpotHandler();
          case "bitfinex"
            return new BitfinexSpotHandler();
          default:          
            return new NotFoundHandler();
        }
      }
    }
    return null;
  }
}

//==== Crypto API ====//

export interface ICryptoSpotApi {
  getSpot(symbol: Symbol): Promise<SpotPrice>;
}

export interface ISymbolFormatter {
  format(symbol: Symbol): string;
}

export class Symbol {
  constructor(public base: string, public target: string) {}

  public toString() {
    return `${this.base}-${this.target}`;
  }

  public static fromString(str: string): Symbol {
    let symbolParts = str.split('-');
    if (symbolParts.length != 2 || !symbolParts[0] || !symbolParts[1]) {
      throw new Error("Invalid symbol");
    }
    return new Symbol(symbolParts[0], symbolParts[1]);
  }
}

export class SpotPrice {
  constructor(
    public symbol: string,
    public price: string,
    public utcTime: string,
    public provider: string
  ) {}
}

export class DirectParser {
  public parse(url: URL): {type: string, symbol: Symbol} {
    
    let parts = url.pathname
      .replace("/api/direct/", "") //strip the part we know
      .split("/") //split
      .filter(val => val) //filter any empty
      console.log(parts);
      return {type: parts[1], symbol: Symbol.fromString(parts[2])};
  }
}

// /**
//  * Returns a spot price from GDAX.
//  *
//  * Symbol format is <BASE>-<TARGETt>
//  *
//  * GDAX response looks like this:
//  * {
//  *  "trade_id":40240431,
//  *  "price":"8371.58000000",
//  *  "size":"0.01668154",
//  *  "bid":"8371.57",
//  *  "ask":"8371.58",
//  *  "volume":"17210.40916422",
//  *  "time":"2018-03-23T05:23:59.807000Z"
//  * }
//  */
export class GdaxSpotHandler implements ICryptoSpotApi, IRouteHandler {

  parser = new DirectParser();
  constructor() {
  }

  async handle(req: RequestContextBase): Promise<Response> {
    let result = this.parser.parse(req.url);
    let spot = await this.getSpot(Symbol.fromString(result.symbol.toString()));
    return new Response(JSON.stringify(spot));
  }

  public async getSpot(symbol: Symbol): Promise<SpotPrice> {
    let fmt = new GdaxSymbolFormatter();
    let symbolFmt = fmt.format(symbol);
    let url = `https://api.gdax.com/products/${symbolFmt}/ticker`;
    let res = await fetch(url);
    return this.parseSpot(symbol, res);
  }

  private async parseSpot(symbol: Symbol, res: Response): Promise<SpotPrice> {
    let json: any = await res.json();
    return new SpotPrice(symbol.toString(), json.price, json.time, "gdax");
  }
}

export class GdaxSymbolFormatter implements ISymbolFormatter {
  format(symbol: Symbol): string {
    return `${symbol.base}-${symbol.target}`;
  }
}

/**
 * Bitfinex Provider
 * 
 * Symbol format is <base><target>
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
export class BitfinexSpotHandler implements ICryptoSpotApi, IRouteHandler {
  
  parser = new DirectParser();
  constructor() {
  }
  
  async handle(req: RequestContextBase): Promise<Response> {
    let result = this.parser.parse(req.url);
    let spot = await this.getSpot(Symbol.fromString(result.symbol.toString()));
    return new Response(JSON.stringify(spot));

  }

  async getSpot(symbol: Symbol): Promise<SpotPrice> {
    let fmt = new BitfinexSymbolFormatter();
    let symbolFmt = fmt.format(symbol);
    let res = await fetch(`https://api.bitfinex.com/v1/pubticker/${symbolFmt}`);
    return this.parseSpot(symbol, res);
  }

  private async parseSpot(symbol: Symbol, res: Response): Promise<SpotPrice> {
    let json: any = await res.json();
    return new SpotPrice(
      symbol.toString(), 
      json.last_price, 
      new Date(parseFloat(json.timestamp) * 1000).toISOString(), 
      "bitfinex");
  }
}

export class BitfinexSymbolFormatter implements ISymbolFormatter {
  format(symbol: Symbol): string {
    return `${symbol.base}${symbol.target}`;
  }
}

// /**
//  * /api/race/spot/btc-usd
//  * /api/aggregate/spot/btc-usd
//  * /api/gdax/spot/btc-usd
//  */
// export class RequestParser {
//   private types: string[];
//   private providers: string[];
//   private actions: string[];

//   constructor() {
//     this.actions = ['race', 'all', 'ping'];
//     this.providers = ['gdax', 'bitfinex'];
//     this.types = ['spot'];
//   }

//   public parse(req: Request): RequestContext {
//     let parts = req.url.split('/');
//     let firstOrDefault = (arr: string[], item: string): string => {
//       let index = arr.findIndex(x => x === item);
//       return index > -1 ? arr[index] : '';
//     };

//     //One or the other (action OR provider could be 5th e.g. /api/race or api/gdax/);
//     let action: string = firstOrDefault(this.actions, parts[4]);
//     let provider: string = firstOrDefault(this.providers, parts[4]);

//     //TODO: The request context and validation should be specific to the route
//     if (action === 'ping') {
//       console.log("Returning request context...");
//       return new RequestContext(req, null, action, '');
//     }

//     let type = parts[5];
//     let symbol = Symbol.fromString(parts[6]);
//     return new RequestContext(req, symbol, action, type, provider);
//   }

//   public validate(req: Request) {
//     if (req.method.toUpperCase() !== 'GET') {
//       return new Response('', {
//         status: 405,
//         statusText: 'GET only supported',
//       });
//     }
//     const help =
//       'The API request should be of the form https://cryptoserviceworker.com/api/[ping]/[race]|[all]|[provider]/spot/<base>|<target> for example, https://cryptoserviceworker.com/api/race/btc-usd or https://cryptoserviceworker.com/api/gdax/btc-usd';

//     try {
//       let parts = req.url.split('/');
//       //0 'https:',
//       //1   '',
//       //2   'cryptoserviceworker.com',
//       //3   'api',
//       //4   'race',
//       //5   'spot',
//       //6   'btc-usd'

//       if (parts === null || parts.length === 0) {
//         return this.badRequest(help);
//       }

//       if (parts[3] !== 'api') {
//         return this.badRequest(help);
//       }

//       //Ping
//       if (parts[4] === 'ping') {
//         console.log('validating as OK...');
//         return null;
//       }

//       if (parts.length !== 7) {
//         return this.badRequest(help);
//       }
//       if (
//         this.actions.indexOf(parts[4]) == -1 &&
//         this.providers.indexOf(parts[4]) == -1
//       ) {
//         return this.badRequest(help);
//       }
//       if (this.types.indexOf(parts[5]) == -1) {
//         return this.badRequest(help);
//       }
//       let isNullOrEmpty = (value: string) => {
//         return !value || value == undefined || value == '' || value.length == 0;
//       };

//       let symbol = parts[6];
//       let symbolParts = parts[6].split('-');
//       if (
//         symbolParts.length !== 2 || //2 parts, base and target
//         isNullOrEmpty(symbolParts[0]) ||
//         isNullOrEmpty(symbolParts[1])
//       ) {
//         //base and target
//         return this.badRequest(help);
//       }
//     } catch (e) {
//       //TOOD: debug header if enabled.
//       return this.badRequest(help);
//     }
//     return null;
//   }

//   private badRequest(statusText: string): Response {
//     return new Response('', {
//       status: 400,
//       statusText: statusText,
//     });
//   }
// }





// addEventListener('fetch', event => {
//   event.respondWith(fetchAndLog(event.request))
// })

// /**
//  * Fetch and log a given request object
//  * @param {Request} request
//  */
// async function fetchAndLog(request) {
//   // console.log('Got request', request)
//   // const response = await fetch(request)
//   // console.log('Got response', response)
//   // return response
//   let h = new exports.RequestHandler();
//   return h.handle(request);
// }
