/*
 * HUSH stand-in for the Google IMA SDK (imasdk.googleapis.com/js/sdkloader/ima3.js).
 * Video players wait for this SDK before they start; this version exposes the same API but every
 * ad request fails right away with "no ads", so players go straight to the video.
 * GPL-3.0-or-later.
 */
(function () {
  'use strict';
  var w = window;
  if (w.google && w.google.ima && w.google.ima.__hush) return;

  function noop() {}
  // Any setter / getter the player calls that we did not spell out stays harmless.
  function lenient(target) {
    return new Proxy(target, {
      get: function (t, p) {
        if (p in t) return t[p];
        if (typeof p !== 'string') return undefined;
        if (/^set|^add|^remove|^init|^destroy|^on/.test(p)) return noop;
        if (/^is|^has/.test(p)) return function () { return false; };
        if (/^get/.test(p)) return function () { return undefined; };
        return undefined;
      },
    });
  }

  function Emitter() { this._l = {}; }
  Emitter.prototype.addEventListener = function (type, fn, capture, scope) {
    var types = Array.isArray(type) ? type : [type];
    for (var i = 0; i < types.length; i++) (this._l[types[i]] = this._l[types[i]] || []).push({ fn: fn, scope: scope });
  };
  Emitter.prototype.removeEventListener = function (type, fn) {
    var types = Array.isArray(type) ? type : [type];
    for (var i = 0; i < types.length; i++) {
      var list = this._l[types[i]];
      if (list) this._l[types[i]] = list.filter(function (l) { return l.fn !== fn; });
    }
  };
  Emitter.prototype._emit = function (type, ev) {
    var list = (this._l[type] || []).slice();
    for (var i = 0; i < list.length; i++) {
      try {
        if (typeof list[i].fn === 'function') list[i].fn.call(list[i].scope || null, ev);
        else if (list[i].fn && typeof list[i].fn.handleEvent === 'function') list[i].fn.handleEvent(ev);
      } catch (e) { setTimeout(function () { throw e; }); }
    }
  };

  var ErrorCode = {
    VAST_MALFORMED_RESPONSE: 100, UNKNOWN_AD_RESPONSE: 1010, VAST_TRAFFICKING_ERROR: 200, VAST_LOAD_TIMEOUT: 301,
    VAST_TOO_MANY_REDIRECTS: 302, VIDEO_PLAY_ERROR: 400, VAST_MEDIA_LOAD_TIMEOUT: 402, VAST_LINEAR_ASSET_MISMATCH: 403,
    OVERLAY_AD_PLAYING_FAILED: 500, OVERLAY_AD_LOADING_FAILED: 502, VAST_NONLINEAR_ASSET_MISMATCH: 503,
    COMPANION_REQUIRED_ERROR: 602, UNKNOWN_ERROR: 900, VPAID_ERROR: 901, FAILED_TO_REQUEST_ADS: 1005,
    VAST_ASSET_NOT_FOUND: 1007, VAST_EMPTY_RESPONSE: 1009, ADS_REQUEST_NETWORK_ERROR: 1012,
    INVALID_AD_TAG: 1013, STREAM_INITIALIZATION_FAILED: 1020, ASSET_FALLBACK_FAILED: 1021,
    INVALID_ARGUMENTS: 1101, AUTOPLAY_DISALLOWED: 1205,
  };

  function AdError(message, code, type) {
    this.message = message; this.errorCode = code; this.type = type;
  }
  AdError.ErrorCode = ErrorCode;
  AdError.Type = { AD_LOAD: 'adLoadError', AD_PLAY: 'adPlayError' };
  AdError.prototype.getErrorCode = function () { return this.errorCode; };
  AdError.prototype.getVastErrorCode = function () { return 303; };
  AdError.prototype.getMessage = function () { return this.message; };
  AdError.prototype.getType = function () { return this.type; };
  AdError.prototype.getInnerError = function () { return null; };
  AdError.prototype.toString = function () { return 'AdError ' + this.errorCode + ': ' + this.message; };

  function AdErrorEvent(error, ctx) { this.error = error; this.ctx = ctx; this.type = AdErrorEvent.Type.AD_ERROR; }
  AdErrorEvent.Type = { AD_ERROR: 'adError' };
  AdErrorEvent.prototype.getError = function () { return this.error; };
  AdErrorEvent.prototype.getUserRequestContext = function () { return this.ctx || {}; };

  var AdEventType = {
    AD_BREAK_READY: 'adBreakReady', AD_BUFFERING: 'adBuffering', AD_METADATA: 'adMetadata', AD_PROGRESS: 'adProgress',
    ALL_ADS_COMPLETED: 'allAdsCompleted', CLICK: 'click', COMPLETE: 'complete', CONTENT_PAUSE_REQUESTED: 'contentPauseRequested',
    CONTENT_RESUME_REQUESTED: 'contentResumeRequested', DURATION_CHANGE: 'durationChange', FIRST_QUARTILE: 'firstQuartile',
    IMPRESSION: 'impression', INTERACTION: 'interaction', LINEAR_CHANGED: 'linearChanged', LOADED: 'loaded', LOG: 'log',
    MIDPOINT: 'midpoint', PAUSED: 'pause', RESUMED: 'resume', SKIPPABLE_STATE_CHANGED: 'skippableStateChanged',
    SKIPPED: 'skip', STARTED: 'start', THIRD_QUARTILE: 'thirdQuartile', USER_CLOSE: 'userClose',
    VIDEO_CLICKED: 'videoClicked', VIDEO_ICON_CLICKED: 'videoIconClicked', VIEWABLE_IMPRESSION: 'viewable_impression',
    VOLUME_CHANGED: 'volumeChange', VOLUME_MUTED: 'mute', AD_CAN_PLAY: 'adCanPlay',
  };
  function AdEvent(type) { this.type = type; }
  AdEvent.Type = AdEventType;
  AdEvent.prototype.getAd = function () { return null; };
  AdEvent.prototype.getAdData = function () { return {}; };

  function AdsManager() { Emitter.call(this); this.volume = 1; }
  AdsManager.prototype = Object.create(Emitter.prototype);
  Object.assign(AdsManager.prototype, {
    collapse: noop, configureAdsManager: noop, destroy: noop, discardAdBreak: noop, expand: noop, focus: noop,
    getAdSkippableState: function () { return false; }, getCuePoints: function () { return []; },
    getCurrentAd: function () { return null; }, getCurrentAdCuePoints: function () { return []; },
    getRemainingTime: function () { return 0; }, getVolume: function () { return this.volume; },
    init: noop, isCustomClickTrackingUsed: function () { return false; },
    isCustomPlaybackUsed: function () { return false; }, pause: noop, requestNextAdBreak: noop, resize: noop,
    resume: noop, setVolume: function (v) { this.volume = v; }, skip: noop, stop: noop, updateAdsRenderingSettings: noop,
    start: function () {
      var self = this;
      setTimeout(function () {
        self._emit(AdEventType.CONTENT_RESUME_REQUESTED, new AdEvent(AdEventType.CONTENT_RESUME_REQUESTED));
        self._emit(AdEventType.ALL_ADS_COMPLETED, new AdEvent(AdEventType.ALL_ADS_COMPLETED));
      });
    },
  });

  function AdsManagerLoadedEvent(ctx) { this.ctx = ctx; this.type = AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED; }
  AdsManagerLoadedEvent.Type = { ADS_MANAGER_LOADED: 'adsManagerLoaded' };
  AdsManagerLoadedEvent.prototype.getAdsManager = function () { return lenient(new AdsManager()); };
  AdsManagerLoadedEvent.prototype.getUserRequestContext = function () { return this.ctx || {}; };

  function ImaSdkSettings() { this.locale = 'en'; this.vpaidMode = 0; this.playerType = ''; this.playerVersion = ''; }
  ImaSdkSettings.VpaidMode = { DISABLED: 0, ENABLED: 1, INSECURE: 2 };
  ImaSdkSettings.CompanionBackfillMode = { ALWAYS: 'always', ON_MASTER_AD: 'on_master_ad' };
  Object.assign(ImaSdkSettings.prototype, {
    getLocale: function () { return this.locale; }, setLocale: function (l) { this.locale = l; },
    getVpaidMode: function () { return this.vpaidMode; }, setVpaidMode: function (m) { this.vpaidMode = m; },
    getPlayerType: function () { return this.playerType; }, setPlayerType: function (t) { this.playerType = t; },
    getPlayerVersion: function () { return this.playerVersion; }, setPlayerVersion: function (v) { this.playerVersion = v; },
    getNumRedirects: function () { return 4; }, getCompanionBackfill: function () { return 'always'; },
    getDisableCustomPlaybackForIOS10Plus: function () { return false; }, isCookiesEnabled: function () { return true; },
    isVpaidAdapterEnabled: function () { return false; },
  });

  function AdsLoader() { Emitter.call(this); this.settings = lenient(new ImaSdkSettings()); }
  AdsLoader.prototype = Object.create(Emitter.prototype);
  Object.assign(AdsLoader.prototype, {
    contentComplete: noop, destroy: noop, releaseVideoViews: noop,
    getSettings: function () { return this.settings; },
    getVersion: function () { return ima.VERSION; },
    requestAds: function (request, ctx) {
      var self = this;
      setTimeout(function () {
        self._emit(AdErrorEvent.Type.AD_ERROR, new AdErrorEvent(new AdError('No ads available', ErrorCode.VAST_EMPTY_RESPONSE, AdError.Type.AD_LOAD), ctx));
      });
    },
  });

  function AdDisplayContainer() {}
  Object.assign(AdDisplayContainer.prototype, { initialize: noop, destroy: noop });

  function AdsRequest() {
    this.adTagUrl = ''; this.adsResponse = ''; this.linearAdSlotWidth = 0; this.linearAdSlotHeight = 0;
    this.nonLinearAdSlotWidth = 0; this.nonLinearAdSlotHeight = 0; this.forceNonLinearFullSlot = false;
    this.vastLoadTimeout = 5000; this.liveStreamPrefetchSeconds = 0;
  }
  AdsRequest.prototype.setAdWillAutoPlay = noop;
  AdsRequest.prototype.setAdWillPlayMuted = noop;
  AdsRequest.prototype.setContinuousPlayback = noop;

  function AdsRenderingSettings() {
    this.autoAlign = true; this.bitrate = -1; this.enablePreloading = false; this.loadVideoTimeout = 8000;
    this.mimeTypes = null; this.playAdsAfterTime = -1; this.restoreCustomPlaybackStateOnAdBreakComplete = false;
    this.uiElements = null; this.useStyledLinearAds = false; this.useStyledNonLinearAds = false;
  }
  function CompanionAdSelectionSettings() {}
  CompanionAdSelectionSettings.CreativeType = { ALL: 'All', FLASH: 'Flash', IMAGE: 'Image' };
  CompanionAdSelectionSettings.ResourceType = { ALL: 'All', HTML: 'Html', IFRAME: 'IFrame', STATIC: 'Static' };
  CompanionAdSelectionSettings.SizeCriteria = { IGNORE: 'IgnoreSize', SELECT_EXACT_MATCH: 'SelectExactMatch', SELECT_NEAR_MATCH: 'SelectNearMatch' };

  var ima = {
    __hush: true,
    VERSION: '3.600.0',
    AdCuePoints: function () {},
    AdDisplayContainer: AdDisplayContainer,
    AdError: AdError,
    AdErrorEvent: AdErrorEvent,
    AdEvent: AdEvent,
    AdsLoader: AdsLoader,
    AdsManager: AdsManager,
    AdsManagerLoadedEvent: AdsManagerLoadedEvent,
    AdsRenderingSettings: AdsRenderingSettings,
    AdsRequest: AdsRequest,
    CompanionAdSelectionSettings: CompanionAdSelectionSettings,
    ImaSdkSettings: ImaSdkSettings,
    OmidAccessMode: { DOMAIN: 'domain', FULL: 'full', LIMITED: 'limited' },
    OmidVerificationVendor: {},
    UiElements: { AD_ATTRIBUTION: 'adAttribution', COUNTDOWN: 'countdown' },
    UniversalAdIdInfo: function () {},
    ViewMode: { FULLSCREEN: 'fullscreen', NORMAL: 'normal' },
    settings: lenient(new ImaSdkSettings()),
    dai: { api: {} },
  };
  w.google = w.google || {};
  w.google.ima = ima;
})();
