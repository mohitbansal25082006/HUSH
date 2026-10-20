(function() {
  'use strict';
  const noopfn = function() {};
  const noopthisfn = function() { return this; };
  const noopnullfn = function() { return null; };
  const nooparrayfn = function() { return []; };
  const noopstrfn = function() { return ''; };
  const companionAdsService = { addEventListener: noopthisfn, enableSyncLoading: noopfn, setRefreshUnfilledSlots: noopfn };
  const contentService = { addEventListener: noopthisfn, setContent: noopfn };
  const PassbackSlot = function() {};
  let p = PassbackSlot.prototype;
  p.display = noopfn; p.get = noopnullfn; p.set = noopthisfn; p.setClickUrl = noopthisfn;
  p.setTagForChildDirectedTreatment = noopthisfn; p.setTargeting = noopthisfn; p.updateTargetingFromMap = noopthisfn;
  const pubAdsService = {
    addEventListener: noopthisfn, removeEventListener: noopthisfn, clear: noopfn, clearCategoryExclusions: noopthisfn,
    clearTagForChildDirectedTreatment: noopthisfn, clearTargeting: noopthisfn, collapseEmptyDivs: noopfn,
    defineOutOfPagePassback() { return new PassbackSlot(); }, definePassback() { return new PassbackSlot(); },
    disableInitialLoad: noopfn, display: noopfn, enableAsyncRendering: noopfn, enableLazyLoad: noopfn,
    enableSingleRequest: noopfn, enableSyncRendering: noopfn, enableVideoAds: noopfn, get: noopnullfn,
    getAttributeKeys: nooparrayfn, getTargeting: nooparrayfn, getTargetingKeys: nooparrayfn, getSlots: nooparrayfn,
    isInitialLoadDisabled() { return true; }, refresh: noopfn, set: noopthisfn, setCategoryExclusion: noopthisfn,
    setCentering: noopfn, setCookieOptions: noopthisfn, setForceSafeFrame: noopthisfn, setLocation: noopthisfn,
    setPrivacySettings: noopthisfn, setPublisherProvidedId: noopthisfn, setRequestNonPersonalizedAds: noopthisfn,
    setSafeFrameConfig: noopthisfn, setTagForChildDirectedTreatment: noopthisfn, setTargeting: noopthisfn,
    setVideoContent: noopthisfn, updateCorrelator: noopfn,
  };
  const SizeMappingBuilder = function() { this.res = []; };
  p = SizeMappingBuilder.prototype;
  p.addSize = function() { this.res.push(arguments); return this; };
  p.build = function() { return this.res; };
  const Slot = function(adUnitPath, size, divId) { this.adUnitPath = adUnitPath; this.size = size; this.divId = divId; };
  p = Slot.prototype;
  p.addService = noopthisfn; p.clearCategoryExclusions = noopthisfn; p.clearTargeting = noopthisfn;
  p.defineSizeMapping = noopthisfn; p.get = noopnullfn;
  p.getAdUnitPath = function() { return this.adUnitPath; };
  p.getAttributeKeys = nooparrayfn; p.getCategoryExclusions = nooparrayfn;
  p.getDomId = function() { return this.divId; };
  p.getResponseInformation = noopnullfn;
  p.getSlotElementId = function() { return this.divId; };
  p.getSlotId = noopthisfn; p.getTargeting = nooparrayfn; p.getTargetingKeys = nooparrayfn;
  p.set = noopthisfn; p.setCategoryExclusion = noopthisfn; p.setClickUrl = noopthisfn;
  p.setCollapseEmptyDiv = noopthisfn; p.setTargeting = noopthisfn; p.updateTargetingFromMap = noopthisfn;
  p.toString = noopstrfn;
  const gpt = window.googletag || {};
  const cmd = gpt.cmd || [];
  gpt.apiReady = true;
  gpt.cmd = [];
  gpt.cmd.push = function(a) { try { a(); } catch (ex) {} return 1; };
  gpt.companionAds = function() { return companionAdsService; };
  gpt.content = function() { return contentService; };
  gpt.defineOutOfPageSlot = function(adUnitPath, divId) { return new Slot(adUnitPath, [1, 1], divId); };
  gpt.defineSlot = function(adUnitPath, size, divId) { return new Slot(adUnitPath, size, divId); };
  gpt.destroySlots = noopfn; gpt.disablePublisherConsole = noopfn; gpt.display = noopfn;
  gpt.enableServices = noopfn; gpt.getVersion = noopstrfn;
  gpt.pubads = function() { return pubAdsService; };
  gpt.pubadsReady = true;
  gpt.setAdIframeTitle = noopfn;
  gpt.sizeMapping = function() { return new SizeMappingBuilder(); };
  window.googletag = gpt;
  while (cmd.length !== 0) gpt.cmd.push(cmd.shift());
})();
