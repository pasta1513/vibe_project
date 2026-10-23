"""clothing pattern mode and colors

옷 표에 무늬 표현과 벡터 색상 수 칸을 더합니다 (P-39, DATA-MODEL §3). 이미 있는 옷은 비어 있습니다(없음).

Revision ID: b39c1a7e5d20
Revises: 6f73741edb79
Create Date: 2026-10-22 17:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'b39c1a7e5d20'
down_revision: Union[str, Sequence[str], None] = '6f73741edb79'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('clothing', schema=None) as batch_op:
        batch_op.add_column(sa.Column('pattern_mode', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
        batch_op.add_column(sa.Column('pattern_colors', sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('clothing', schema=None) as batch_op:
        batch_op.drop_column('pattern_colors')
        batch_op.drop_column('pattern_mode')
