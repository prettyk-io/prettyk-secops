# PrettyK Pure — перенос образов в закрытый (airgap) реестр
#
# После сборки бандла образы можно перенести в закрытый реестр,
# доступный всем нодам airgap-контура.
#
# Шаги:
#   1. Распаковать бандл: tar -xzf prettyk-pure-vX.Y.Z-airgap.tar.gz
#   2. docker load < images/*.tar
#   3. Перетегировать образы на закрытый реестр:
#
#       REGISTRY=registry.airgap.local:5000/prettyk
#
#       docker tag zaproxy/zap-stable:2.17.0           $REGISTRY/scanner:2.17.0
#       docker tag pk-playwright-authoring:local        $REGISTRY/browser:latest
#       docker tag prettyk-allure3:local                $REGISTRY/allure3:latest
#       docker tag pk-api-lab:local                     $REGISTRY/api-lab:latest
#       docker tag bkimminich/juice-shop:v20.1.1        $REGISTRY/target:latest
#
#   4. Запушить:
#
#       docker push $REGISTRY/scanner:2.17.0
#       docker push $REGISTRY/browser:latest
#       docker push $REGISTRY/allure3:latest
#       docker push $REGISTRY/api-lab:latest
#       docker push $REGISTRY/target:latest
#
#   5. Обновить compose-файлы: заменить image: на $REGISTRY/...
#
# Для Kubernetes (Helm):
#   helm install prettyk ./helm/prettyk \
#     --set session.scanner.image.repository=$REGISTRY/scanner \
#     --set session.browser.image.repository=$REGISTRY/browser \
#     ...
#
# Инвариант: на целевых нодах НЕТ доступа к Docker Hub / ghcr.io.
# Все образы загружены из закрытого реестра.