import { Button } from "@/components/ui/button.tsx"
import { LucideHome } from "lucide-react"
import { Link } from "react-router-dom"
import { H1, P } from "@/components/ui/typography.tsx"
import { useTranslation } from "react-i18next"

export default function Disclaimer() {
    const { t } = useTranslation("disclaimer")

    return (
        <section className="mx-auto mt-25 flex max-w-4xl flex-col items-center justify-center px-4 sm:px-6">
            <H1>{t("common:disclaimer.label")}</H1>
            <P className={"text-center"}>{t("common:disclaimer.value", { projectName: t("projectName"), coreName: t("coreName") })}</P>
            <Button asChild className={"mt-8"}>
                <Link to={"/"}>
                    <LucideHome />
                    {t("common:disclaimer.button")}
                </Link>
            </Button>
        </section>
    )
}
