"use client"

import * as React from "react"

import { Checkbox } from "@/styles/base-nova/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/styles/base-nova/ui/table"

const tableData = [
  {
    id: "1",
    name: "Sarah Chen",
    email: "sarah.chen@example.com",
    role: "管理员",
  },
  {
    id: "2",
    name: "Marcus Rodriguez",
    email: "marcus.rodriguez@example.com",
    role: "用户",
  },
  {
    id: "3",
    name: "Priya Patel",
    email: "priya.patel@example.com",
    role: "用户",
  },
  {
    id: "4",
    name: "David Kim",
    email: "david.kim@example.com",
    role: "编辑者",
  },
]

export function CheckboxInTable() {
  const [selectedRows, setSelectedRows] = React.useState<Set<string>>(
    new Set(["1"])
  )

  const selectAll = selectedRows.size === tableData.length

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRows(new Set(tableData.map((row) => row.id)))
    } else {
      setSelectedRows(new Set())
    }
  }

  const handleSelectRow = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedRows)
    if (checked) {
      newSelected.add(id)
    } else {
      newSelected.delete(id)
    }
    setSelectedRows(newSelected)
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8">
            <Checkbox
              id="select-all-checkbox"
              name="select-all-checkbox"
              checked={selectAll}
              onCheckedChange={handleSelectAll}
            />
          </TableHead>
          <TableHead>名称</TableHead>
          <TableHead>邮箱</TableHead>
          <TableHead>角色</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tableData.map((row) => (
          <TableRow
            key={row.id}
            data-state={selectedRows.has(row.id) ? "selected" : undefined}
          >
            <TableCell>
              <Checkbox
                id={`row-${row.id}-checkbox`}
                name={`row-${row.id}-checkbox`}
                checked={selectedRows.has(row.id)}
                onCheckedChange={(checked) =>
                  handleSelectRow(row.id, checked === true)
                }
              />
            </TableCell>
            <TableCell className="font-medium">{row.name}</TableCell>
            <TableCell>{row.email}</TableCell>
            <TableCell>{row.role}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
