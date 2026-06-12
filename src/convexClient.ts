import {
  ConvexClient as BrowserConvexClient,
  type ConvexClientOptions,
} from 'convex/browser'
import { Context, Layer } from 'effect'

export class ConvexClient extends Context.Service<
  ConvexClient,
  BrowserConvexClient
>()('strudel/ConvexClient') {}

export const makeConvexClientLayer = (
  url: string,
  options?: ConvexClientOptions,
) => Layer.sync(ConvexClient, () => new BrowserConvexClient(url, options))