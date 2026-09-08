
interface ProjectNameInputProps {
  name: string;
  onChangeName: (newName: string) => void;
}

export function ProjectNameInput({ name, onChangeName }: ProjectNameInputProps) {
  return (
    <div className="space-y-2">
      <label
        htmlFor="project-name-input"
        className="block text-xs font-semibold text-ink"
      >
        Project Name
      </label>
      <input
        id="project-name-input"
        type="text"
        value={name}
        onChange={(e) => onChangeName(e.target.value)}
        placeholder="Enter project name..."
        className="w-full bg-paper border border-ink/20 rounded-md px-3 py-2 text-xs font-medium text-ink outline-none focus:border-ink/60 transition-colors shadow-2xs"
      />
    </div>
  );
}
