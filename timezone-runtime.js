const APP_TIME_ZONE='America/Manaus';

function normalizeTimeZoneOptions(options){
  const next={...(options||{})};
  if(!next.timeZone||next.timeZone==='America/Sao_Paulo')next.timeZone=APP_TIME_ZONE;
  return next;
}

const NativeDateTimeFormat=Intl.DateTimeFormat;
function ManausDateTimeFormat(locales,options){
  return new NativeDateTimeFormat(locales,normalizeTimeZoneOptions(options));
}
ManausDateTimeFormat.prototype=NativeDateTimeFormat.prototype;
Object.setPrototypeOf(ManausDateTimeFormat,NativeDateTimeFormat);
ManausDateTimeFormat.supportedLocalesOf=NativeDateTimeFormat.supportedLocalesOf.bind(NativeDateTimeFormat);
Intl.DateTimeFormat=ManausDateTimeFormat;

globalThis.PROVEDOR_PLUS_TIME_ZONE=APP_TIME_ZONE;
