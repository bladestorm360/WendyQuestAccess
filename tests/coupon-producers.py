"""Read the installed coupon view and native readiness boundary in memory."""

import json
from pathlib import Path
import runpy
import sys


helpers = runpy.run_path(str(Path(__file__).with_name('file-producers.py')))
decode = helpers['load_decoder']()
between = helpers['between']
from registration import MENU_REL, WINDOW_REL, menu_notifications


def methods(installed):
    original = (installed / MENU_REL).read_bytes()
    source, _ = decode(menu_notifications(original).decode('utf8'))
    text, _ = decode((installed / WINDOW_REL).read_text(encoding='utf-8-sig'))
    selected = [
        between(source, "(Window_CouponList['prototype']['constructor']=Window_CouponList)['prototype']['initialize']=function(",
                "},Window_CouponList['prototype']['update']") + '};'
    ]
    for owner, name, tail in (
        ('Scene_Coupons', 'createCouponsWindow', 'couponWindowRect'),
        ('Window_CouponList', 'makeCommandList', 'createTitleText'),
        ('Window_CouponList', 'processOk', 'selectCoupon'),
    ):
        selected.append(between(source, f"{owner}['prototype']['{name}']=function(",
                                f"}},{owner}['prototype']['{tail}']") + '};')
    for owner, name, tail in (
        ('Scene_Coupons', 'onCouponSelected', 'onRedeemSuccess'),
        ('Window_CouponList', 'createTitleText', 'statusWidth'),
        ('Window_CouponList', 'selectCoupon', 'invalidSelection'),
    ):
        selected.append(between(source, f"{owner}['prototype']['{name}']=async function(",
                                f"}},{owner}['prototype']['{tail}']") + '};')
    selected.append(between(source, "Scene_Coupons['prototype']['update']=function(",
                            "},Scene_Coupons['prototype']['onCouponSelected']") + '};')
    for name, tail in (
        ('initialize', 'destroy'), ('setText', 'RedrawText'), ('RedrawText', 'GetText'),
        ('createChildSprite', 'createBitmap'), ('createBitmap', 'update'), ('update', 'StartTextAnimation'),
    ):
        selected.append(between(text, f"Sprite_Text['prototype']['{name}']=function(",
                                f"}},Sprite_Text['prototype']['{tail}']") + '};')
    return selected


if __name__ == '__main__':
    print(json.dumps(methods(Path(sys.argv[1]))))
