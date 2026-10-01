export type WeatherKind = "clear" | "fair" | "cloudy" | "stormy";

export interface MindWeather {
  kind: WeatherKind;
  icon: string;
  label: string;
}

// How busy the day's sky looks. For now it counts thoughts; the AI day swaps
// the input for mood tags, and callers only ever see the result.
export function mindWeather(thoughtCount: number): MindWeather {
  if (thoughtCount <= 0) {
    return { kind: "clear", icon: "☀️", label: "Clear skies" };
  }
  if (thoughtCount <= 3) {
    return { kind: "fair", icon: "🌤", label: "Fair, a few clouds" };
  }
  if (thoughtCount <= 7) {
    return { kind: "cloudy", icon: "☁️", label: "Cloudy mind" };
  }
  return { kind: "stormy", icon: "⛈", label: "Stormy mind" };
}
