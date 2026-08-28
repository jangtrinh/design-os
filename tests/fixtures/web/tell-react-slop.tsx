export function Card() {
  return (
    <div className="rounded-2xl border-l-4 border-violet-600 bg-violet-600 p-1">
      <div className="rounded-xl bg-white p-4">
        <h1 className="text-4xl font-bold tracking-[-0.09em] text-gray-400">
          Supercharge your enterprise-grade workflow
        </h1>
        <p className="text-justify text-[11px] leading-none">Body copy here</p>
      </div>
      <span className={cn("border-l-4", isActive && "bg-purple-600")} />
    </div>
  );
}
