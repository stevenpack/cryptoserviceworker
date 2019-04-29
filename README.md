#CryptoServiceWorker

Source for [my post on the Cloudflare blog](https://blog.cloudflare.com/cryptocurrency-api-gateway-typescript-workers/).
 
I build a mini http request routing and handling framework, then use it to build a gateway to multiple crypto API providers. My point here is that in a single file, with no dependencies, you can quickly build prettty sophisticated logic and deploy fast and easy to the Edge. Furthermore, using modern Typescript with async/await and the rich type structure, you also write quite clean, async code.
