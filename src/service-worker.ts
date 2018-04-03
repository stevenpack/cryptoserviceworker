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

// export interface IRequestParser {
//   parse<T>(req: Request): RequestContext<T>
// }  

// export interface IHttpResponder {
//   getResponse(req: Request): Promise<ResponseContext>;
// }

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

/**
 * A wrapper around a Request with a strongly typed request
 */
// export class RequestContext<T> extends RequestContextBase {

//   constructor(public req: Request, public args: T) 
//   {
//     super(req);
//   }
// }

// export class ResponseContext implements ILogger {
//   public logLines: string[] = [];
//   public meta: any = {};
//   constructor(public response: Response) {
//   }

//   log(logLine: string): void {
//     console.log(logLine);
//     this.logLines.push(logLine);
//   }
//   getLines(): string[] {
//     return this.logLines;
//   }
// }

export class Router implements IRouter {

  routes: IRoute[];
  constructor() {
    this.routes = [];
    //TODO: ioc
    this.routes.push(
      new PingRoute()
      // new RaceMatcher(),
      // new AggregateMatcher()
    )
  }

  async handle(request: Request): Promise<Response> {
    let req = new RequestContextBase(request);
    let handler = this.route(req);
    return handler.handle(req);
  }

  route(req: RequestContextBase): IRouteHandler {
    let handler: IRouteHandler | null = this.match(req);
    if (handler) {
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
      //return new RaceRouteHandler(url)
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

export class AggregatorRoute {

}

export class ApiAggregator implements IRouteHandler {
  constructor(private handlers: IRouteHandler[] = []) {}

  handle(req: RequestContextBase): Promise<Response> {    
    return this.all(req, this.handlers);
  }

  IsJsonString(str: string) {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

  async all(req: RequestContextBase, handlers: IRouteHandler[] ): Promise<Response> {    
    let p = await Promise.all(handlers.map(h => h.handle(req)));        
    let arr = p.map(p => p.body);
    return new Response(JSON.stringify(arr));
  }
}


//==== Crypto API ====//

// export class RaceRouteHandler implements IRouteHandler {

//   constructor(private url: URL) {}

  
//   async handle(req: RequestContextBase): Promise<Response> {
//     let parts = this.url.pathname.replace("/api/race", "").split("/");
//     if (parts[0] !== "spot") {
//       return BadRequest.fromString("Only spot supported")
//     }
//     let symbol = Symbol.fromString(parts[1]);
//     //parse the 
//     let racer = new ApiRacer(...)
//     return racer.handle(req);
//   }
// }

// public request: Request,
// public symbol: Symbol,
// public action: string,
// public type: string,
// public provider: string = '',


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
    public utcTime: string
  ) {}
}



// export class RequestHandler {
//   logInjector: LogInterceptor;
//   logInterceptor: LogInterceptor;
//   pingProvider: PingProvider;
//   spotAggregator: ApiAggregator;
//   spotRacer: ApiRacer;
//   bitfinexSpotProvider: BitfinexSpotProvider;
//   gdaxSpotProvider: GdaxSpotProvider;
//   spotProviders: IHttpResponder[];

//   constructor(private parser: RequestParser = new RequestParser()) {
//     //IoC
//     this.gdaxSpotProvider = new GdaxSpotProvider();
//     this.bitfinexSpotProvider = new BitfinexSpotProvider();
//     this.spotProviders = [this.gdaxSpotProvider, this.bitfinexSpotProvider];
//     this.spotRacer = new ApiRacer(this.spotProviders);
//     this.spotAggregator = new ApiAggregator(this.spotProviders);
//     this.pingProvider = new PingProvider();
//     this.logInterceptor = new LogInterceptor();    
//     this.logInjector = new LogInterceptor();
//   }

//   public async handle(req: Request): Promise<Response> {
//     let error = this.parser.validate(req);
//     if (error) {
//       return error;
//     }
//     try {
//       let reqCtx = this.parser.parse(req);
//       let responder = this.route(reqCtx);      
//       let respCtx = await responder.getResponse(reqCtx);
//       respCtx = this.logInterceptor.intercept(reqCtx, respCtx);
//       return respCtx.response;
//     } catch (e) {  
//       console.log(e);
//       let errResponse =  new Response(e.message, {
//         status: 500,
//       });
//       //TODO: DEBUG flag only
//       this.logInjector.inject(e.message, errResponse);
//       return errResponse;
//     }
//   }

//   private route(reqCtx: RequestContext): IHttpResponder {
//     if (reqCtx.type === 'spot') {
//       if (reqCtx.action === 'race') {
//         return this.spotRacer;
//       }
//       if (reqCtx.action === 'all') {
//         return this.spotAggregator;
//       }
//     }
//     if (reqCtx.action === 'ping') {
//       reqCtx.log(`Route: ${reqCtx.request.url} -> 'ping'`)
//       return this.pingProvider;
//     }
//     if (reqCtx.provider === 'gdax') {
//       return this.gdaxSpotProvider;
//     }
//     if (reqCtx.provider == 'bitfinex') {
//       return this.gdaxSpotProvider;
//     }
//     throw new Error('Route not found');
//   }
// }

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





// export class PingProvider implements IHttpResponder {
//   async getResponse(req: RequestContext): Promise<ResponseContext> {
//     console.log("returning pong response...");
//     const pong = "pong;"
//     let res = new Response(pong);
//     req.log(`Responding with ${pong} and ${res.status}`);
//     return new ResponseContext(pong, res);
//   }
// }

// export class LogInterceptor implements ILogDecorator, ILogInjector {
//   intercept(req: RequestContext, res: ResponseContext): ResponseContext {
//     res.log("Executing log interceptor");
//     let logLines = [];
//     logLines.push(req.logLines);
//     logLines.push(res.logLines);
//     let logStr = encodeURIComponent(logLines.join("\n"));
//     this.inject(logStr, res.response); 
//     return res;
//   }

//   inject(log: string, res: Response): void {
//     res.headers.append("X-DEBUG", log);
//   }
// }

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
// export class GdaxSpotProvider implements ICryptoSpotApi, IHttpResponder {
//   async getResponse(req: RequestContextBase): Promise<ResponseContext> {
//     let spot = await this.getSpot(req.symbol);
//     let response = new Response(JSON.stringify(spot));
//     let resCtx = new ResponseContext(response);
//     resCtx.meta["provider"] = "gdax";
//     return resCtx;
//   }

//   public async getSpot(symbol: Symbol): Promise<SpotPrice> {
//     let fmt = new GdaxSymbolFormatter();
//     let symbolFmt = fmt.format(symbol);
//     let res = await fetch(`https://api.gdax.com/products/${symbolFmt}/ticker`);
//     return this.parseSpot(symbol, res);
//   }

//   private async parseSpot(symbol: Symbol, res: Response): Promise<SpotPrice> {
//     let json: any = await res.body;
//     return new SpotPrice(symbol.toString(), json.price, json.time);
//   }
// }

// export class GdaxSymbolFormatter implements ISymbolFormatter {
//   format(symbol: Symbol): string {
//     return `${symbol.base}-${symbol.target}`;
//   }
// }

// /**
//  * Bitfinex Provider
//  * 
//  * Symbol format is <base><target>
//  * 
// * {
//     "mid":"244.755",
//     "bid":"244.75",
//     "ask":"244.76",
//     "last_price":"244.82",
//     "low":"244.2",
//     "high":"248.19",
//     "volume":"7842.11542563",
//     "timestamp":"1444253422.348340958"
//   }
//  */
// export class BitfinexSpotProvider implements ICryptoSpotApi, IHttpResponder {
//   async getResponse(req: RequestContext): Promise<ResponseContext> {
//     let spot = await this.getSpot(req.symbol);
//     let response = new Response(JSON.stringify(spot));
//     return new ResponseContext('bitfinex', response);
//   }

//   async getSpot(symbol: Symbol): Promise<SpotPrice> {
//     let fmt = new BitfinexSymbolFormatter();
//     let symbolFmt = fmt.format(symbol);
//     let res = await fetch(`https://api.bitfinex.com/v1/pubticker/${symbolFmt}`);
//     return this.parseSpot(symbol, res);
//   }

//   private async parseSpot(symbol: Symbol, res: Response): Promise<SpotPrice> {
//     let json: any = await res.json();
//     return new SpotPrice(
//       symbol.toString(),
//       json.last_price,
//       new Date(parseFloat(json.timestamp) * 1000).toISOString()
//     );
//   }
// }

// export class BitfinexSymbolFormatter implements ISymbolFormatter {
//   format(symbol: Symbol): string {
//     return `${symbol.base}${symbol.target}`;
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
