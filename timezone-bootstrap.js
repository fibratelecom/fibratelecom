(()=>{
  'use strict';
  const TIME_ZONE='America/Manaus';
  const NativeDateTimeFormat=Intl.DateTimeFormat;
  const normalizeOptions=options=>{
    const next={...(options||{})};
    if(!next.timeZone||next.timeZone==='America/Sao_Paulo')next.timeZone=TIME_ZONE;
    return next;
  };
  function ManausDateTimeFormat(locales,options){return new NativeDateTimeFormat(locales,normalizeOptions(options));}
  ManausDateTimeFormat.prototype=NativeDateTimeFormat.prototype;
  Object.setPrototypeOf(ManausDateTimeFormat,NativeDateTimeFormat);
  ManausDateTimeFormat.supportedLocalesOf=NativeDateTimeFormat.supportedLocalesOf.bind(NativeDateTimeFormat);
  Intl.DateTimeFormat=ManausDateTimeFormat;
  const originalString=Date.prototype.toLocaleString;
  const originalDate=Date.prototype.toLocaleDateString;
  const originalTime=Date.prototype.toLocaleTimeString;
  Date.prototype.toLocaleString=function(locales,options){return originalString.call(this,locales,normalizeOptions(options));};
  Date.prototype.toLocaleDateString=function(locales,options){return originalDate.call(this,locales,normalizeOptions(options));};
  Date.prototype.toLocaleTimeString=function(locales,options){return originalTime.call(this,locales,normalizeOptions(options));};
  globalThis.PROVEDOR_PLUS_TIME_ZONE=TIME_ZONE;
})();
