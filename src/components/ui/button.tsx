import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-[color,background-color,opacity,transform,box-shadow] duration-200 active:translate-y-0 active:opacity-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "btn-glow text-primary-foreground hover:-translate-y-px hover:brightness-110 motion-reduce:hover:translate-y-0",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        outline:
          "border border-brand-200/80 bg-white/70 backdrop-blur-sm hover:border-brand-300 hover:bg-white hover:text-brand-900",
        secondary: "bg-brand-50 text-brand-900 hover:bg-brand-100",
        ghost: "hover:bg-brand-50 hover:text-brand-900",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4 py-2 md:h-10",
        sm: "h-9 rounded-lg px-3 text-[13px]",
        lg: "h-11 rounded-lg px-8",
        icon: "h-11 w-11 md:h-10 md:w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
