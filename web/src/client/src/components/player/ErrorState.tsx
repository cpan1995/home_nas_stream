import { AlertCircle, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

interface ErrorStateProps {
    error: string
    onRetry?: () => void
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
    return (
        <div className="flex h-full min-h-100 w-full items-center justify-center p-6">
            <div className="w-full max-w-md space-y-4">
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Playback Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>

                {onRetry && (
                    <Button onClick={onRetry} variant="outline" className="w-full gap-2">
                        <RotateCcw className="h-4 w-4" />
                        Try Again
                    </Button>
                )}
            </div>
        </div>
    )
}
