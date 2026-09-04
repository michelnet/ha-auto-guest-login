function requestOrigin(request) {
  const host = request.host ?? request.get?.('host');
  return new URL(`${request.protocol}://${host}`).origin;
}

export class Utils {
  constructor({ appPublicUrl } = {}) {
    this.appPublicUrl = appPublicUrl?.replace(/\/+$/, '');
  }

  getGuestLoginUrl(request) {
    return this.appPublicUrl ?? requestOrigin(request);
  }
}
