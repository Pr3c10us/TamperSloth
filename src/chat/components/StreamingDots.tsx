export function StreamingDots() {
    return (
        <div className="flex items-center gap-1.5">
            {[0, 1, 2].map((i) => (
                <span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-foreground"
                    style={{
                        animation: `slothPulse 1.4s cubic-bezier(.22,.61,.36,1) ${i * 0.18}s infinite`,
                    }}
                />
            ))}
            <style>{`@keyframes slothPulse {
                0%, 80%, 100% { opacity: 0.25; transform: scale(0.8); }
                40% { opacity: 1; transform: scale(1); }
            }`}</style>
        </div>
    );
}
