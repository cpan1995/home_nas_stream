import { Button } from "@/components/ui/button.tsx"
import { HomeIcon } from "lucide-react"
import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"

export default function NotFound() {
    const { t } = useTranslation("common")

    return (
        <div className="flex min-h-[60vh] w-full flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
            <h1 className="text-4xl font-bold">{t("notFound.title")}</h1>
            <p className="text-lg">{t("notFound.description")}</p>
            <p className="text-lg text-muted-foreground italic">{t("notFound.quoteAuthor")}</p>
            <div className={"mt-2 flex flex-col items-center justify-center gap-2"}>
                <Button size="lg" asChild>
                    <Link to="/" className="mt-4">
                        {t("notFound.backLink")}
                        <HomeIcon />
                    </Link>
                </Button>
            </div>
        </div>
    )
}
