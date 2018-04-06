//mock the methods and objects that will be available in the browser
// --BEGIN COMMENT--
import fetch from 'node-fetch';
import { Request } from 'node-fetch';
import { Response } from 'node-fetch';
import { URL } from 'url';
const window = {};
// --END COMMENT--
// --BEGIN UNCOMMENT--
// addEventListener('fetch', event => {
//   event.respondWith(fetchAndLog(event.request))
// })

// async function fetchAndLog(request) {
//   let router = new exports.Router();
//   return router.handle(request);
// }
// --END UNCOMMENT--

//==== Framework ====//

export interface IRouter {
  route(req: RequestContextBase): IRouteHandler
}

/**
 * A route.
 * 
 * Used to match an /api call to a IRouteHandler
 */
export interface IRoute {
  match(req: RequestContextBase): IRouteHandler | null;
}

/**
 * Handles a request.
 */
export interface IRouteHandler {
    handle(req: RequestContextBase): Promise<Response>;
}

/**
 * Intercepts requests before handlers and responses after handlers
 */
export interface IInterceptor {
  preProcess(req: RequestContextBase, res: Response | null): Response | null;
  postProcess(req: RequestContextBase, res: Response): Response | null;
}

export interface ILogger {
  debug(logLine: string): void;
  info(logLine: string): void;
  warn(logLine: string): void;
  error(logLine: string): void;
  getLines() : string[];
}

/**
 * Request with additional convenience properties
 */
export class RequestContextBase{ 

  public url: URL;
  constructor(public request: Request) {
    this.url = new URL(request.url);
  }

  public static fromString(str: string) {
    return new RequestContextBase(new Request(str));
  }
}

export class Logger implements ILogger {
  debug(logLine: string): void {
    this.log(`DEBUG: ${logLine}`);
  }
  info(logLine: string): void {
    this.log(`INFO: ${logLine}`);
  }
  warn(logLine: string): void {
    this.log(`WARN: ${logLine}`);
  }
  error(logLine: string): void {
    this.log(`ERROR: ${logLine}`);
  }
  public logLines: string[] = [];

  private log(logLine: string): void {
    console.log(logLine);
    this.logLines.push(logLine);
  }
  getLines(): string[] {
    return this.logLines;
  } 
}

//Check is in scope like this in worker, or needs to be on window.
const logger = new Logger();

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
    this.interceptors = [new LogInterceptor, new CacheInterceptor];
  }

  public async handle(request: Request): Promise<Response> {
    let req = new RequestContextBase(request);
    let res = this.preProcess(req);
    if (!res) {
      let handler = this.route(req);
      res = await handler.handle(req);
    }    
    res = this.postProcess(req, res)
    return res;
  }

  /**
   * Run the interceptors and return their response if provided, or the original
   * @param req 
   * @param res 
   */
  private preProcess(req: RequestContextBase): Response | null {
    let preProcessResponse = null;
    for (let interceptor of this.interceptors) {
      preProcessResponse = interceptor.preProcess(req, preProcessResponse);
    }
    return preProcessResponse;
  }

  private postProcess(req: RequestContextBase, res: Response): Response {
    let postProcessResponse = null;
    for (let interceptor of this.interceptors) {
      postProcessResponse = interceptor.postProcess(req, postProcessResponse || res);
    }
    return postProcessResponse || res;
  }

  route(req: RequestContextBase): IRouteHandler {
    let handler: IRouteHandler | null = this.match(req);
    if (handler) {
      logger.debug(`Found handler for ${req.url.pathname}`);
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

//=== Interceptors ===

export class LogInterceptor implements IInterceptor {
  
  preProcess(req: RequestContextBase, res: Response): Response {    
    return res;
  }
  
  postProcess(req: RequestContextBase, res: Response): Response {
    logger.debug("Evaluating request for log request")
    if (req.url.searchParams.get("debug") !== "true" && req.request.headers.get("X-DEBUG") !== "true") {
      return res;
    }
    logger.info("Executing log interceptor");
    let logStr = encodeURIComponent(logger.getLines().join("\n"));
    this.inject(logStr, res); 
    return res;
  }

  inject(log: string, res: Response): void {
    res.headers.append("X-DEBUG", log);
  }
}

export class CacheInterceptor implements IInterceptor {

  cache: WindowCache;
  constructor() {
    this.cache = new WindowCache(window);
  }

  preProcess(req: RequestContextBase, res: Response): Response | null {    
    //if the cache header or query param is there, use cache
    logger.debug("Evaluating CacheInterceptor...");
    let maxAgeMs = this.getMaxAgeMs(req);
    if (maxAgeMs > 0) {
      logger.info(`maxAgeMs ${maxAgeMs} > 0, checking cache`);
      //use cache if not expired
      let entry = this.cache.tryGetEntry<Response>(req.url.pathname, maxAgeMs);
      if (entry == null) {
        //expired
        return res;
      }
      //use the cached version      
      res = entry.item;
      res.headers.set("Age", entry.ageSecs().toString())
      //status code?
    }  
    return res;
  }
  postProcess(req: RequestContextBase, res: Response): Response {
    //Cache responses by path name
    //TODO: don't cache cache endpoints! ...won't get here anyway?
    this.cache.setEntry<Response>(req.url.pathname, new CacheEntry<Response>(res));
    return res;
  }

  private getMaxAgeMs(req: RequestContextBase): number {
    let maxAgeParam = req.url.searchParams.get("max-age");
    if (maxAgeParam) {
      try {
        let maxAgeSecs = parseInt(maxAgeParam);
        logger.debug(`Got max-age=${maxAgeSecs} from query params`);
        return maxAgeSecs * 1000;
      } catch (e) {
        //TODO: bad request
        return -1;
      }
    }
    let maxAgeHeader = req.request.headers.get("Cache-Control");
    if (maxAgeHeader) {
      let maxAgeValue = maxAgeHeader.replace("max-age=", "");
      try {
        let maxAgeSecs = parseInt(maxAgeValue);
        logger.debug(`Got max-age=${maxAgeSecs} from Cache-Control header`);
        return maxAgeSecs * 1000;
      } catch (e) {
        //TODO: bad request
        return -1
      }
    }
    return -1;
  }
}

/**
 * Cache backed by global window variable.
 * 
 * Can die at any time
 * Doesn't offer any purging
 */
export class WindowCache {
  
  window: any;
  constructor(windowObj: any = null) {    
    logger.debug(`windowObj=${windowObj}`)
    logger.debug(`window=${window}`)
    this.window = windowObj || window || {};
    if (!window.cache) {
      logger.info("Recreating cache from scratch");
      this.window.cache = {};      
    }    
  }

  public tryGetEntry<T>(key: string, maxAgeMs: number): CacheEntry<T> | null {
    let entry = this.getEntry<T>(key);
    if (!entry) {
      return null; //not in cache
    }
    if (entry.ageMs() >= maxAgeMs) {
      return null; // expired
    }
    return entry; //fresh
  }

  public getEntry<T>(key: string): CacheEntry<T> | null {
    logger.debug(`Checking for entry at ${key}`);
    let entry = this.window.cache[key] as CacheEntry<T>;
    logger.debug(entry ? `entry.ageMs=${entry.ageMs()}ms` : `Not found`);
    return entry;
  }

  public setEntry<T>(key: string, entry: CacheEntry<T>) {
    logger.info(`Storing entry at ${key}`);
    this.window.cache[key] = entry;
  }
}

export class CacheEntry<T> {
  
  public cachedAtUtc: number;
  
  constructor(public item: T) {
    this.cachedAtUtc = Date.now();
  }

  public ageMs(): number {
    return Date.now() - this.cachedAtUtc;
  }

  public ageSecs() : number {
    return Math.round(this.ageMs() / 1000);
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

export class HandlerFactory {
  constructor(private providerHandlers: IRouteHandler[] = []) {
    this.providerHandlers.push(
      new GdaxSpotHandler(),
      new BitfinexSpotHandler()
    )
  }

  public getProviderHandlers(): IRouteHandler[] {
    return this.providerHandlers;
  }
}

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
    logger.info(`Responding with ${pong} and ${res.status}`);
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
      return new RacerHandler()
    }
    return null;
  }
}

export class RacerHandler implements IRouteHandler {
  constructor(private handlers: IRouteHandler[] = []) {    
    let factory = new HandlerFactory();
    this.handlers = factory.getProviderHandlers();
  }

  handle(req: RequestContextBase): Promise<Response> {
    return this.race(req, this.handlers);
  }

  async race(req: RequestContextBase, responders: IRouteHandler[]): Promise<Response> {
    let arr = responders.map(r => r.handle(req));
    return Promise.race(arr);
  }
}

export class AllRoute implements IRoute {
  match(req: RequestContextBase): IRouteHandler | null {    
    if (req.url.pathname.startsWith("/api/all/")) {
      return new AllHandler();
    }
    return null;
  }
}

export class AllHandler implements IRouteHandler {
  constructor(private handlers: IRouteHandler[] = []) {
    let factory = new HandlerFactory();
    this.handlers = factory.getProviderHandlers();
  }

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
      // /api/direct/gdax/btc-spot
      let parts = req.url.pathname.split("/").filter(val => val);
      console.log(parts);
      if (parts.length > 2) {
        let provider = parts[2];
        switch (provider) {
          case "gdax":
            return new GdaxSpotHandler();
          case "bitfinex":
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
      .replace(new RegExp("\/api\/(direct|race|all)[\/(gdax|bitfinex)]+"), "") //strip the part we know
      .split("/") //so left with /spot/btc-usd. split
      .filter(val => val) //filter any empty
      console.log(parts);
      return {type: parts[0], symbol: Symbol.fromString(parts[1])};
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

