import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface EmergencyService {
  id: string;
  name: string;
  type: 'hospital' | 'police' | 'embassy' | 'fire' | 'pharmacy';
  address: string;
  phone: string;
  distance: string;
  latitude: number;
  longitude: number;
}

interface EmergencyServicesProps {
  location?: string;
  className?: string;
}

export function EmergencyServices({ location = "Current Location", className = '' }: EmergencyServicesProps) {
  const { toast } = useToast();

  // Mock emergency services data - in production, this would come from a real API
  const emergencyServices: EmergencyService[] = [
    {
      id: '1',
      name: 'City General Hospital',
      type: 'hospital',
      address: '123 Medical Center Dr',
      phone: '+1 (555) 123-4567',
      distance: '0.8 km',
      latitude: 40.7128,
      longitude: -74.0060,
    },
    {
      id: '2',
      name: 'Central Police Station',
      type: 'police',
      address: '456 Police Plaza',
      phone: '+1 (555) 911-0000',
      distance: '1.2 km',
      latitude: 40.7129,
      longitude: -74.0061,
    },
    {
      id: '3',
      name: 'US Embassy',
      type: 'embassy',
      address: '789 Embassy Row',
      phone: '+1 (555) 234-5678',
      distance: '2.1 km',
      latitude: 40.7130,
      longitude: -74.0062,
    },
    {
      id: '4',
      name: '24/7 Pharmacy Plus',
      type: 'pharmacy',
      address: '321 Health Ave',
      phone: '+1 (555) 345-6789',
      distance: '0.5 km',
      latitude: 40.7127,
      longitude: -74.0059,
    },
  ];

  const serviceIcons: Record<EmergencyService['type'], { icon: string; color: string }> = {
    hospital: { icon: 'fas fa-hospital', color: 'text-ios-red' },
    police: { icon: 'fas fa-shield-alt', color: 'text-ios-blue' },
    embassy: { icon: 'fas fa-building', color: 'text-ios-orange' },
    fire: { icon: 'fas fa-fire-extinguisher', color: 'text-ios-red' },
    pharmacy: { icon: 'fas fa-pills', color: 'text-ios-green' },
  };

  const handleSOSCall = () => {
    toast({
      title: "Emergency Call Initiated",
      description: "Connecting to emergency services...",
      variant: "destructive",
    });
    
    // In a real app, this would initiate an actual emergency call
    setTimeout(() => {
      toast({
        title: "Call Connected",
        description: "Emergency services have been contacted",
      });
    }, 2000);
  };

  const handleCallService = (service: EmergencyService) => {
    toast({
      title: "Calling Service",
      description: `Calling ${service.name}...`,
    });
    
    // In a real app, this would initiate a call or show directions
    // For web, we can't directly make calls, but we could open tel: links
    window.open(`tel:${service.phone}`, '_self');
  };

  const handleGetDirections = (service: EmergencyService) => {
    // Open directions in the user's preferred maps app
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${service.latitude},${service.longitude}&travelmode=driving`;
    window.open(mapsUrl, '_blank');
    
    toast({
      title: "Directions Opened",
      description: `Getting directions to ${service.name}`,
    });
  };

  return (
    <Card className={`bg-ios-card border-ios-gray ${className}`} data-testid="emergency-services">
      <CardHeader>
        <CardTitle className="text-lg font-bold text-white flex items-center">
          <i className="fas fa-shield-alt text-ios-red mr-2"></i>
          Emergency Services
        </CardTitle>
        <p className="text-sm text-ios-gray">Near {location}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* SOS Button */}
        <Button
          onClick={handleSOSCall}
          className="w-full bg-ios-red hover:bg-red-600 text-white font-bold py-4 text-lg"
          data-testid="button-sos"
        >
          <i className="fas fa-phone mr-2"></i>
          SOS EMERGENCY CALL
        </Button>

        {/* Emergency Services List */}
        <div className="space-y-3">
          {emergencyServices.map((service) => (
            <div 
              key={service.id} 
              className="bg-ios-darker rounded-xl p-4"
              data-testid={`emergency-service-${service.id}`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center space-x-3">
                  <div className={`text-xl ${serviceIcons[service.type].color}`}>
                    <i className={serviceIcons[service.type].icon}></i>
                  </div>
                  <div>
                    <h3 className="font-medium text-white">{service.name}</h3>
                    <p className="text-sm text-ios-gray">{service.address}</p>
                    <p className="text-xs text-ios-gray">{service.distance} away</p>
                  </div>
                </div>
                <span className="text-xs text-ios-blue bg-ios-blue/20 px-2 py-1 rounded-full">
                  {service.type.charAt(0).toUpperCase() + service.type.slice(1)}
                </span>
              </div>
              
              <div className="flex space-x-2 mt-3">
                <Button
                  onClick={() => handleCallService(service)}
                  size="sm"
                  className="flex-1 bg-ios-green hover:bg-green-600"
                  data-testid={`button-call-${service.id}`}
                >
                  <i className="fas fa-phone mr-1 text-xs"></i>
                  Call
                </Button>
                <Button
                  onClick={() => handleGetDirections(service)}
                  size="sm"
                  variant="outline"
                  className="flex-1 bg-ios-darker border-ios-gray text-white hover:bg-ios-card"
                  data-testid={`button-directions-${service.id}`}
                >
                  <i className="fas fa-directions mr-1 text-xs"></i>
                  Directions
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Help Information */}
        <div className="bg-ios-red/20 rounded-xl p-4 border border-ios-red/30">
          <h4 className="font-medium text-ios-red mb-2 flex items-center">
            <i className="fas fa-exclamation-triangle mr-2"></i>
            Emergency Numbers
          </h4>
          <div className="space-y-1 text-sm">
            <p className="text-white"><strong>Police:</strong> 911 (US) / 112 (EU)</p>
            <p className="text-white"><strong>Medical:</strong> 911 (US) / 112 (EU)</p>
            <p className="text-white"><strong>Fire:</strong> 911 (US) / 112 (EU)</p>
          </div>
        </div>

        <div className="text-center">
          <p className="text-xs text-ios-gray">
            <i className="fas fa-info-circle mr-1"></i>
            Location services required for accurate results
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
