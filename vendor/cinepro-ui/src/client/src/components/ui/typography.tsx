import * as React from "react"

type Props = React.HTMLAttributes<HTMLElement> & {
    children?: React.ReactNode
}

export function H1({ children, className = "", ...props }: Props) {
    return (
        <h1 className={`scroll-m-20 text-center text-4xl font-extrabold tracking-tight text-balance ${className}`} {...props}>
            {children}
        </h1>
    )
}

export function H2({ children, className = "", ...props }: Props) {
    return (
        <h2 className={`scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight first:mt-0 ${className}`} {...props}>
            {children}
        </h2>
    )
}

export function H3({ children, className = "", ...props }: Props) {
    return (
        <h3 className={`scroll-m-20 text-2xl font-semibold tracking-tight ${className}`} {...props}>
            {children}
        </h3>
    )
}

export function H4({ children, className = "", ...props }: Props) {
    return (
        <h4 className={`scroll-m-20 font-semibold tracking-tight ${className}`} {...props}>
            {children}
        </h4>
    )
}

export function P({ children, className = "", ...props }: Props) {
    return (
        <p className={`leading-7 not-first:mt-6 ${className}`} {...props}>
            {children}
        </p>
    )
}

export function Lead({ children, className = "", ...props }: Props) {
    return (
        <p className={`text-xl text-muted-foreground ${className}`} {...props}>
            {children}
        </p>
    )
}

export function Large({ children, className = "", ...props }: Props) {
    return (
        <div className={`text-lg font-semibold ${className}`} {...props}>
            {children}
        </div>
    )
}

export function Small({ children, className = "", ...props }: Props) {
    return (
        <small className={`text-sm leading-none font-medium ${className}`} {...props}>
            {children}
        </small>
    )
}

export function Muted({ children, className = "", ...props }: Props) {
    return (
        <p className={`text-sm text-muted-foreground ${className}`} {...props}>
            {children}
        </p>
    )
}

export function InlineCode({ children, className = "", ...props }: Props) {
    return (
        <code className={`relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold ${className}`} {...props}>
            {children}
        </code>
    )
}

export function List({ children, className = "", ...props }: Props) {
    return (
        <ul className={`my-6 ml-6 list-disc [&>li]:mt-2 ${className}`} {...props}>
            {children}
        </ul>
    )
}
