var exports = {};
addEventListener('fetch', event => {
  event.respondWith(fetchAndLog(event.request))
});

async function fetchAndLog(request) {
  let router = new exports.Router();
  return await router.handle(request);
}
