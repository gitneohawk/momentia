import type { ComponentPropsWithoutRef } from "react";

type ImgProps = ComponentPropsWithoutRef<"img">;

function classNames(...values: Array<string | undefined | null | false>) {
  return values.filter(Boolean).join(" ");
}

function BlogImage(props: ImgProps) {
  const { alt, className, loading, ...rest } = props;
  return (
    <figure className="my-10 flex flex-col items-center">
      <img
        {...rest}
        alt={alt ?? ""}
        loading={loading ?? "lazy"}
        className={classNames(
          "w-full max-w-2xl rounded-3xl shadow-lg ring-1 ring-black/5 object-cover",
          className,
        )}
      />
      {alt && (
        <figcaption className="mt-3 text-sm text-neutral-500 text-center">{alt}</figcaption>
      )}
    </figure>
  );
}

export const blogMdxComponents = {
  img: BlogImage,
};

export type BlogMdxComponents = typeof blogMdxComponents;
