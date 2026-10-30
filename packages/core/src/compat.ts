import { Service } from 'cordis'

// cordis 4.0.0-rc.12 renamed `Service.resolveConfig` to `Service.resolveIntercept`,
// but @cordisjs/plugin-server 1.7.0 (the latest release) still calls
// `server[Service.resolveConfig]()`. Both return the merged intercept config
// when called without arguments, so the old name is an alias of the new one.
// Remove this module once plugin-server supports rc.12.
if (!('resolveConfig' in Service)) {
  Object.defineProperty(Service, 'resolveConfig', { value: Service.resolveIntercept })
}
