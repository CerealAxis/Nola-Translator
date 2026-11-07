import { IconGitBranch, IconGitFork } from "@tabler/icons-react"

import { Button } from "@/styles/base-nova/ui/button"

export default function ButtonWithIcon() {
  return (
    <div className="flex gap-2">
      <Button variant="outline">
        <IconGitBranch data-icon="inline-start" /> 新建分支
      </Button>
      <Button variant="outline">
        分支
        <IconGitFork data-icon="inline-end" />
      </Button>
    </div>
  )
}
