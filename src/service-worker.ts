// --BEGIN PREAMBLE--
/// var exports = {};
/// addEventListener('fetch', event => {
///   event.respondWith(fetchAndApply(event.request))
/// });
///
/// async function fetchAndApply(request) {
///   let router = new exports.Router();
///   return router.handle(request);
/// }
// --END PREAMBLE--

// --BEGIN COMMENT--
// mock the methods and objects that will be available in the browser
import fetch from 'node-fetch';
// tslint:disable-next-line:no-duplicate-imports
import { Request, Response } from 'node-fetch';
import { URL } from 'url';
// --END COMMENT--

// ==== Framework ====//
export interface IRouter {
  route(req: RequestContextBase): IRouteHandler;
}

/**
 * A route
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

export interface ILogger {
  debug(logLine: string): void;
  info(logLine: string): void;
  warn(logLine: string): void;
  error(logLine: string): void;
}

/**
 * Request with additional convenience properties
 */
export class RequestContextBase {
  public static fromString(str: string) {
    return new RequestContextBase(new Request(str));
  }

  public url: URL;
  constructor(public request: Request) {
    this.url = new URL(request.url);
  }
}

export class Logger implements ILogger {
  private log = console;

  public debug(logLine: string): void {
    this.log.debug(`${logLine}`);
  }
  public info(logLine: string): void {
    this.log.info(`${logLine}`);
  }
  public warn(logLine: string): void {
    this.log.warn(`${logLine}`);
  }
  public error(logLine: string): void {
    this.log.error(`${logLine}`);
  }
}

const logger = new Logger();

export class Router implements IRouter {
  public routes: IRoute[];

  constructor() {
    this.routes = [
      new PingRoute(),
      new RaceRoute(),
      new AllRoute(),
      new DirectRoute(),
    ];
  }

  public async handle(request: Request): Promise<Response> {
    try {
      const req = new RequestContextBase(request);
      const handler = this.route(req);
      return handler.handle(req);
    } catch (e) {
      return new Response(undefined, {
        status: 500,
        statusText: `Error. ${e.message}`,
      });
    }
  }

  public route(req: RequestContextBase): IRouteHandler {
    const handler: IRouteHandler | null = this.match(req);
    if (handler) {
      logger.debug(`Found handler for ${req.url.pathname}`);
      return handler;
    }
    return new NotFoundHandler();
  }

  public match(req: RequestContextBase): IRouteHandler | null {
    for (const route of this.routes) {
      const handler = route.match(req);
      if (handler != null) {
        return handler;
      }
    }
    return null;
  }
}

// Common handlers

/**
 * 404 Not Found
 */
export class NotFoundHandler implements IRouteHandler {
  public async handle(req: RequestContextBase): Promise<Response> {
    return new Response(undefined, {
      status: 404,
      statusText: 'Unknown route',
    });
  }
}

/**
 * 405 Method Not Allowed
 */
export class MethodNotAllowedHandler implements IRouteHandler {
  public async handle(req: RequestContextBase): Promise<Response> {
    return new Response(undefined, {
      status: 405,
      statusText: 'Method not allowed',
    });
  }
}

// ==== API ====//

export class HandlerFactory {
  constructor(private providerHandlers: IRouteHandler[] = []) {
    this.providerHandlers.push(
      new GdaxSpotHandler(),
      new BitfinexSpotHandler()
    );
  }

  public getProviderHandlers(): IRouteHandler[] {
    return this.providerHandlers;
  }
}

export class PingRoute implements IRoute {
  public match(req: RequestContextBase): IRouteHandler | null {
    if (req.request.method !== 'GET') {
      return new MethodNotAllowedHandler();
    }
    if (req.url.pathname.startsWith('/api/ping')) {
      return new PingRouteHandler();
    }
    return null;
  }
}

export class PingRouteHandler implements IRouteHandler {
  public async handle(req: RequestContextBase): Promise<Response> {
    const pong = 'pong;';
    const res = new Response(pong);
    logger.info(`Responding with ${pong} and ${res.status}`);
    return new Response(pong);
  }
}

export class RaceRoute implements IRoute {
  public match(req: RequestContextBase): IRouteHandler | null {
    const url = new URL(req.request.url);
    if (url.pathname.startsWith('/api/race/')) {
      return new RaceHandler();
    }
    return null;
  }
}

export class RaceHandler implements IRouteHandler {
  constructor(private readonly handlers: IRouteHandler[] = []) {
    const factory = new HandlerFactory();
    this.handlers = factory.getProviderHandlers();
  }

  public handle(req: RequestContextBase): Promise<Response> {
    return this.race(req, this.handlers);
  }

  public async race(
    req: RequestContextBase,
    responders: IRouteHandler[]
  ): Promise<Response> {
    const arr = responders.map(r => r.handle(req));
    return Promise.race(arr);
  }
}

export class AllRoute implements IRoute {
  public match(req: RequestContextBase): IRouteHandler | null {
    if (req.url.pathname.startsWith('/api/all/')) {
      return new AllHandler();
    }
    return null;
  }
}

export class AllHandler implements IRouteHandler {
  constructor(private readonly handlers: IRouteHandler[] = []) {
    if (handlers.length === 0) {
      const factory = new HandlerFactory();
      logger.debug('No handlers, getting from factory');
      this.handlers = factory.getProviderHandlers();
    }
  }

  public async handle(req: RequestContextBase): Promise<Response> {
    const responses = await Promise.all(
      this.handlers.map(async h => h.handle(req))
    );
    const jsonArr = await Promise.all(responses.map(async r => r.json()));
    return new Response(JSON.stringify(jsonArr, 0, 2));
  }
}

export class DirectRoute implements IRoute {
  public match(req: RequestContextBase): IRouteHandler | null {
    if (req.url.pathname.startsWith('/api/direct')) {
      logger.debug('Matching direct route');
      // Split and filter any empty
      // /api/direct/gdax/btc-spot
      const parts = req.url.pathname.split('/').filter(val => val);
      logger.debug(JSON.stringify(parts));
      if (parts.length > 2) {
        const provider = parts[2];
        switch (provider) {
          case 'gdax':
            return new GdaxSpotHandler();
          case 'bitfinex':
            return new BitfinexSpotHandler();
          default:
            return new NotFoundHandler();
        }
      }
    }
    return null;
  }
}

// ==== Crypto API ====//

export interface ICryptoSpotApi {
  getSpot(symbol: InstrumentSymbol): Promise<SpotPrice>;
}

export interface ISymbolFormatter {
  format(symbol: InstrumentSymbol): string;
}

export class InstrumentSymbol {
  public static fromString(str: string): InstrumentSymbol {
    const symbolParts = str.split('-');
    if (symbolParts.length !== 2 || !symbolParts[0] || !symbolParts[1]) {
      throw new Error(`Invalid symbol from ${str}`);
    }
    return new InstrumentSymbol(symbolParts[0], symbolParts[1]);
  }

  constructor(public base: string, public target: string) {}

  public toString() {
    return `${this.base}-${this.target}`;
  }
}

export class SpotPrice {
  public symbol: string;
  public price: string;
  public utcTime: string;
  public provider: string;
  constructor(
    symbol: string,
    price: string,
    utcTime: string,
    provider: string
  ) {
    // Using longhand to satisfy the unused variable linter
    this.symbol = symbol;
    this.price = price;
    this.utcTime = utcTime;
    this.provider = provider;
  }
}

export class DirectParser {
  public parse(url: URL): { type: string; symbol: InstrumentSymbol } {
    // language=JSRegexp
    const parts = url.pathname
      .replace(new RegExp('/api/(direct|race|all)[/(gdax|bitfnex)]+'), '') // strip the part we know
      .split('/') // so left with /spot/btc-usd. split
      .filter(val => val); // filter any empty
    logger.debug(JSON.stringify(parts));
    return { type: parts[0], symbol: InstrumentSymbol.fromString(parts[1]) };
  }
}

// /**
//  * Returns a spot price from GDAX.
//  *
//  * InstrumentSymbol format is <BASE>-<TARGETt>
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
  public parser = new DirectParser();

  public async handle(req: RequestContextBase): Promise<Response> {
    const result = this.parser.parse(req.url);
    const spot = await this.getSpot(
      InstrumentSymbol.fromString(result.symbol.toString())
    );
    return new Response(JSON.stringify(spot));
  }

  public async getSpot(symbol: InstrumentSymbol): Promise<SpotPrice> {
    const fmt = new GdaxSymbolFormatter();
    const symbolFmt = fmt.format(symbol);
    const url = `https://api.gdax.com/products/${symbolFmt}/ticker`;
    logger.debug(`Getting spot from ${url}`);

    // GDAX requires a User-Agent.
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CryptoServiceWorker' },
    });
    return this.parseSpot(symbol, res);
  }

  private async parseSpot(
    symbol: InstrumentSymbol,
    res: Response
  ): Promise<SpotPrice> {
    logger.debug(`Parsing spot...`);
    // this has an empty response saying "need user agent". add above and test.
    const json: any = await res.json();
    logger.debug(`GDAX response ${JSON.stringify(json)}`);
    return new SpotPrice(symbol.toString(), json.price, json.time, 'gdax');
  }
}

export class GdaxSymbolFormatter implements ISymbolFormatter {
  public format(symbol: InstrumentSymbol): string {
    return `${symbol.base}-${symbol.target}`;
  }
}

/**
 * Bitfinex Provider
 *
 * InstrumentSymbol format is <base><target>
 *
 * {
 *   "mid":"244.755",
 *   "bid":"244.75",
 *   "ask":"244.76",
 *   "last_price":"244.82",
 *   "low":"244.2",
 *   "high":"248.19",
 *   "volume":"7842.11542563",
 *  "timestamp":"1444253422.348340958"
 * }
 */
export class BitfinexSpotHandler implements ICryptoSpotApi, IRouteHandler {
  public parser = new DirectParser();

  public async handle(req: RequestContextBase): Promise<Response> {
    const result = this.parser.parse(req.url);
    const spot = await this.getSpot(
      InstrumentSymbol.fromString(result.symbol.toString())
    );
    return new Response(JSON.stringify(spot));
  }

  public async getSpot(symbol: InstrumentSymbol): Promise<SpotPrice> {
    const fmt = new BitfinexSymbolFormatter();
    const symbolFmt = fmt.format(symbol);
    const res = await fetch(
      `https://api.bitfinex.com/v1/pubticker/${symbolFmt}`
    );
    return this.parseSpot(symbol, res);
  }

  private async parseSpot(
    symbol: InstrumentSymbol,
    res: Response
  ): Promise<SpotPrice> {
    const json: any = await res.json();
    logger.debug(`Bitfinex response ${JSON.stringify(json)}`);
    return new SpotPrice(
      symbol.toString(),
      json.last_price,
      new Date(parseFloat(json.timestamp) * 1000).toISOString(),
      'bitfinex'
    );
  }
}

export class BitfinexSymbolFormatter implements ISymbolFormatter {
  public format(symbol: InstrumentSymbol): string {
    return `${symbol.base}${symbol.target}`;
  }
}
