import type { WeekendWeatherLabels } from "./weekend-weather";

type WeatherDict = Omit<WeekendWeatherLabels, "title" | "cols"> & { weekendTitle: string; cols: { track: string } };

/**
 * Підписи для компактного блока з повного словника погоди (racePage.weather): у HTML картки йде лише потрібне
 * (головна лімітована за розміром HTML, e2e «≤ 100 КБ gzip»).
 */
export function weekendLabels(w: WeatherDict): WeekendWeatherLabels {
  return {
    title: w.weekendTitle,
    caption: w.caption,
    loading: w.loading,
    cols: { track: w.cols.track },
    srcShort: w.srcShort,
    dry: w.dry,
    rain: w.rain,
    mm: w.mm,
    cond: w.cond,
    creditLead: w.creditLead,
    creditMeasured: w.creditMeasured,
    creditForecast: w.creditForecast,
  };
}
