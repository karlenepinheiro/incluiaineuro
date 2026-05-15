import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with open('src/services/exportService.ts', encoding='utf-8') as f:
    content = f.read()

# Try different needle variants
candidates = [
    "    doc.save(`Ficha_${student.name.replace(/\\s+/g, '_')}.pdf`);",
    "  doc.save(`Ficha_${student.name.replace(/\\s+/g, '_')}.pdf`);",
    "doc.save(`Ficha_${student.name.replace(/\\s+/g, '_')}.pdf`);",
]
for c in candidates:
    idx = content.find(c)
    print(f'  [{len(c)} chars] found={idx}: {repr(c[:60])}')
