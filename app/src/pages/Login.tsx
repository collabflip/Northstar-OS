import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// F4: OAuth state is a server-generated nonce bound to an httpOnly cookie
// (CSRF protection). The client just hits the login initiation endpoint.
function getOAuthUrl() {
  return "/api/oauth/login";
}

export default function Login() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>Welcome</CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            className="w-full"
            size="lg"
            onClick={() => {
              window.location.href = getOAuthUrl();
            }}
          >
            Sign in with Kimi
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
