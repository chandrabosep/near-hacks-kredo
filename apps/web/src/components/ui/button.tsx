import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

/** Buttons from the design system: one blue for actions, navy for strong, neutrals for the rest. */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-control font-display font-medium whitespace-nowrap transition-[color,background-color,box-shadow] duration-150 outline-none select-none focus-visible:ring-2 focus-visible:ring-wc-blue/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-wc-blue text-white hover:bg-wc-blue-2 hover:shadow-[0_2px_4px_0_rgba(0,0,0,0.16),0_12px_16px_0_rgba(0,68,255,0.24)]",
        primary: "bg-wc-navy font-semibold text-wc-surface hover:bg-wc-neutral-15 hover:text-wc-mint-pastel",
        secondary: "bg-wc-surface-2 text-wc-text-1 hover:bg-wc-border/70",
        outline: "border border-wc-border bg-wc-surface text-wc-text-1 hover:bg-wc-surface-2/60",
        ghost: "bg-transparent text-wc-text-1 hover:bg-wc-surface-2/60",
        link: "bg-transparent px-0 text-wc-blue underline-offset-2 hover:underline",
        danger: "border border-wc-border bg-wc-surface text-wc-error hover:bg-wc-error/5",
      },
      size: {
        xs: "h-7 px-3 text-[12px]",
        sm: "h-9 px-3.5 text-[13px]",
        md: "h-10 px-4 text-[16px]",
        lg: "h-11 px-[18px] text-[16px]",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

function Button({
  className,
  variant,
  size,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return <ButtonPrimitive data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
