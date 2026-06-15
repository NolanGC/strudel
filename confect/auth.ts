declare const process: {
  readonly env: {
    readonly CONVEX_SITE_URL?: string
  }
}

export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: 'convex',
    },
  ],
}
