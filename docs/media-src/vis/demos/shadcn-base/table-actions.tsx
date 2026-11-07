import { MoreHorizontalIcon } from "lucide-react"

import { Button } from "@/styles/base-nova/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/styles/base-nova/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/styles/base-nova/ui/table"

export function TableActions() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>产品</TableHead>
          <TableHead>价格</TableHead>
          <TableHead className="text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-medium">无线鼠标</TableCell>
          <TableCell>$29.99</TableCell>
          <TableCell className="text-right">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon" className="size-8" />
                }
              >
                <MoreHorizontalIcon />
                <span className="sr-only">打开菜单</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>编辑</DropdownMenuItem>
                <DropdownMenuItem>创建副本</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive">
                  删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">机械键盘</TableCell>
          <TableCell>$129.99</TableCell>
          <TableCell className="text-right">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon" className="size-8" />
                }
              >
                <MoreHorizontalIcon />
                <span className="sr-only">打开菜单</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>编辑</DropdownMenuItem>
                <DropdownMenuItem>创建副本</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive">
                  删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">USB-C 集线器</TableCell>
          <TableCell>$49.99</TableCell>
          <TableCell className="text-right">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon" className="size-8" />
                }
              >
                <MoreHorizontalIcon />
                <span className="sr-only">打开菜单</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>编辑</DropdownMenuItem>
                <DropdownMenuItem>创建副本</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive">
                  删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  )
}
