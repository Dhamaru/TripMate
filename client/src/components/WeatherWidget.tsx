import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface WeatherWidgetProps {
  location: string;
  className?: string;
}

interface WeatherData {
  location: string;
  current: {
    temperature: number;
    condition: string;
    humidity: number;
    windSpeed: number;
    icon: string;
  };
  forecast: Array<{
    day: string;
    high: number;
    low: number;
    condition: string;
    icon: string;
  }>;
}

export function WeatherWidget({ location, className = '' }: WeatherWidgetProps) {
  const { data: weather, isLoading, error } = useQuery<WeatherData>({
    queryKey: ['/api/weather', location],
    enabled: !!location,
  });

  if (isLoading) {
    return (
      <Card className={`bg-ios-card border-ios-gray ${className}`} data-testid="weather-widget-loading">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-white">Weather</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <div>
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-12 w-12 rounded-full" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="text-center">
                <Skeleton className="h-4 w-16 mb-1" />
                <Skeleton className="h-4 w-12 mx-auto" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !weather) {
    return (
      <Card className={`bg-ios-card border-ios-gray ${className}`} data-testid="weather-widget-error">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-white">Weather</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-ios-gray text-sm">Unable to load weather data</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`bg-ios-card border-ios-gray ${className}`} data-testid="weather-widget">
      <CardHeader>
        <CardTitle className="text-lg font-bold text-white">Weather Today</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-2xl font-bold text-white" data-testid="weather-temperature">
              {weather.current.temperature}°C
            </p>
            <p className="text-sm text-ios-gray" data-testid="weather-condition">
              {weather.current.condition}
            </p>
          </div>
          <div className="text-ios-blue text-3xl">
            <i className={weather.current.icon} data-testid="weather-icon"></i>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs text-center">
          {weather.forecast.slice(1, 4).map((day, index) => (
            <div key={index} data-testid={`weather-forecast-${index}`}>
              <p className="text-ios-gray">{day.day}</p>
              <p className="font-medium text-white">{day.high}°C</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
