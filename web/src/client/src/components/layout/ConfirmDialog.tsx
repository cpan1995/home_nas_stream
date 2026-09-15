import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { LucideArrowRight, LucideXCircle } from "lucide-react"

export default function ConfirmDialog({
    trigger,
    title,
    description,
    onConfirm,
    variant = "destructive",
    classname = "",
}: {
    trigger: React.ReactNode
    title: string
    description: string
    onConfirm: () => void
    variant?: "default" | "destructive"
    classname?: string
}) {
    return (
        <AlertDialog>
            <AlertDialogTrigger className={classname} asChild>
                {trigger}
            </AlertDialogTrigger>

            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>{description}</AlertDialogDescription>
                </AlertDialogHeader>

                <AlertDialogFooter>
                    <AlertDialogCancel>
                        <LucideXCircle />
                        Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm} className={variant === "destructive" ? "text-destructive-foreground bg-destructive" : ""}>
                        Continue
                        <LucideArrowRight />
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
