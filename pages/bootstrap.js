// GitHub Pages demo: put the demo's service worker in charge of this page, then start the website.
(function () {
  var app = document.getElementById('app')
  function note(t) { if (app) app.innerHTML = '<div style="font:15px system-ui,sans-serif;color:#555;padding:48px;text-align:center">' + t + '</div>' }
  function start() {
    // a stylesheet whose download was interrupted (e.g. a network blip on the very first visit): fetch it again
    Array.prototype.forEach.call(document.querySelectorAll('link[rel=stylesheet]'), function (l) {
      if (!l.sheet) { var c = l.cloneNode(); c.href = l.href + (l.href.indexOf('?') < 0 ? '?' : '&') + 'retry=1'; l.parentNode.insertBefore(c, l.nextSibling) }
    })
    var s = document.createElement('script'); s.type = 'module'; s.src = window.__DMS_APP__; document.head.appendChild(s)
  }
  if (!('serviceWorker' in navigator)) return note('This demo needs a current browser (Chrome, Edge, Firefox or Safari), outside private browsing.')
  note('Loading the DMS demo…')
  navigator.serviceWorker.register('../sw.js', { scope: '../' }).then(function () {
    if (navigator.serviceWorker.controller) return start()
    navigator.serviceWorker.addEventListener('controllerchange', start, { once: true })
    // a hard refresh (Ctrl+Shift+R) skips the worker: reload once normally
    navigator.serviceWorker.ready.then(function () {
      setTimeout(function () {
        if (navigator.serviceWorker.controller) return
        if (sessionStorage.getItem('dms-sw-reload')) return note('Please refresh the page once (F5).')
        sessionStorage.setItem('dms-sw-reload', '1'); location.reload()
      }, 2500)
    })
  }).catch(function (e) { note('The demo could not start: ' + (e && e.message ? e.message : e)) })
})()
